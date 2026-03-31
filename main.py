from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from agent import extract_appointment_details
from datetime import datetime, timedelta
import uuid
import random

app = FastAPI(title="Clinic Smart Assistant Backend")

class Booking(BaseModel):
    clinic_id: str
    telegram_id: int
    ic_passport_number: str 
    service_type: str
    details: Dict[str, Any]
    scheduled_time: str

class TextExtractRequest(BaseModel):
    text: str

class DateRequest(BaseModel):
    clinic_id: str
    duration: int
    doctor_pref: Optional[str] = None

class TimeRequest(BaseModel):
    clinic_id: str
    date: str
    duration: int
    doctor_pref: Optional[str] = None

class AvailabilityRequest(BaseModel):
    clinic_id: str
    requested_time: str
    duration: int
    doctor_pref: Optional[str] = None

@app.post("/ai-extract")
def ai_extract(req: TextExtractRequest):
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    extracted = extract_appointment_details(req.text, now_str)
    if isinstance(extracted, dict) and "error" in extracted: return extracted
    return extracted.dict()

@app.get("/clinic/{clinic_id}")
def get_clinic(clinic_id: str, db: Session = Depends(get_db)):
    clinic = db.query(models.Clinic).filter(models.Clinic.id == clinic_id).first()
    if not clinic: raise HTTPException(status_code=404)
    return clinic

@app.get("/doctors/{clinic_id}")
def get_doctors(clinic_id: str, db: Session = Depends(get_db)):
    return db.query(models.Doctor).filter(models.Doctor.clinic_id == clinic_id).all()

@app.get("/vaccines/{clinic_id}")
def get_vaccines(clinic_id: str, db: Session = Depends(get_db)):
    return db.query(models.Vaccine).filter(models.Vaccine.clinic_id == clinic_id).all()

@app.get("/blood-tests/{clinic_id}/{test_type}")
def get_blood_tests(clinic_id: str, test_type: str, db: Session = Depends(get_db)):
    return db.query(models.BloodTest).filter(models.BloodTest.clinic_id == clinic_id, models.BloodTest.test_type == test_type).all()

@app.get("/patient/{clinic_id}/id/{ic_passport}")
def get_patient_by_id(clinic_id: str, ic_passport: str, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(models.Patient.clinic_id == clinic_id, models.Patient.ic_passport_number == ic_passport).first()
    if not patient: raise HTTPException(status_code=404)
    return patient

@app.post("/register-patient")
def register_patient(data: Dict[str, Any], db: Session = Depends(get_db)):
    existing = db.query(models.Patient).filter(
        models.Patient.clinic_id == data['clinic_id'], 
        models.Patient.ic_passport_number == data['ic_passport_number']
    ).first()
    if existing: return {"status": "already_registered"}
    new_patient = models.Patient(**data)
    db.add(new_patient)
    db.commit()
    return {"status": "success"}

# --- SCHEDULING ENGINE ---
def get_best_doctor_for_date(db: Session, clinic_id: str, date_obj: datetime.date, duration: int, doctor_pref: str):
    doc_query = db.query(models.Doctor).filter(models.Doctor.clinic_id == clinic_id)
    
    if doctor_pref == "MALE": doc_query = doc_query.filter(models.Doctor.gender == "MALE")
    elif doctor_pref == "FEMALE": doc_query = doc_query.filter(models.Doctor.gender == "FEMALE")
    elif doctor_pref and doctor_pref not in ["ANY", "MALE", "FEMALE"]:
        doc_query = doc_query.filter(models.Doctor.name == doctor_pref)

    valid_docs = doc_query.all()
    if not valid_docs: return None, []

    day_of_week = date_obj.strftime("%a").lower()
    now = datetime.now()

    # Get all DB clashes for this date
    start_of_day = datetime.combine(date_obj, datetime.min.time())
    end_of_day = datetime.combine(date_obj, datetime.max.time())

    clashes = db.query(models.ApptStage.scheduled_time, models.Appointment.doctor_id).join(
        models.Appointment).filter(
        models.Appointment.clinic_id == clinic_id,
        models.ApptStage.scheduled_time >= start_of_day,
        models.ApptStage.scheduled_time <= end_of_day
    ).all()

    clash_dict = {}
    for c_time, d_id in clashes:
        if d_id not in clash_dict: clash_dict[d_id] = []
        clash_dict[d_id].append(c_time)

    doc_slots = []

    for doc in valid_docs:
        avail = doc.availability_slots or {}
        if day_of_week not in avail: continue # Doctor not on duty today

        times = avail[day_of_week]
        if len(times) != 2: continue
        
        try:
            start_t = datetime.strptime(times[0], "%H:%M").time()
            end_t = datetime.strptime(times[1], "%H:%M").time()
        except: continue

        curr = datetime.combine(date_obj, start_t)
        end_dt = datetime.combine(date_obj, end_t)
        
        busy_times = clash_dict.get(doc.id, [])
        slots = []
        
        while curr < end_dt:
            if curr > now and curr not in busy_times:
                slots.append(curr)
            curr += timedelta(minutes=duration)
            
        if slots:
            doc_slots.append((doc, slots, len(slots)))

    if not doc_slots: return None, []

    # Goal: Assign to doctor with the MOST free slots, random if tied
    max_free = max(ds[2] for ds in doc_slots)
    best_docs = [ds for ds in doc_slots if ds[2] == max_free]
    chosen = random.choice(best_docs)
    
    return chosen[0], chosen[1]

@app.post("/available-dates")
def get_available_dates(req: DateRequest, db: Session = Depends(get_db)):
    valid_dates = []
    today = datetime.now().date()
    for i in range(14):
        d = today + timedelta(days=i)
        doc, slots = get_best_doctor_for_date(db, req.clinic_id, d, req.duration, req.doctor_pref)
        if slots: valid_dates.append(d.strftime("%Y-%m-%d"))
    return valid_dates

@app.post("/available-times")
def get_available_times(req: TimeRequest, db: Session = Depends(get_db)):
    d_obj = datetime.strptime(req.date, "%Y-%m-%d").date()
    doc, slots = get_best_doctor_for_date(db, req.clinic_id, d_obj, req.duration, req.doctor_pref)
    if not doc: return {"error": "No slots available"}
    
    return {
        "doctor_id": str(doc.id),
        "doctor_name": doc.name,
        "times": [s.strftime("%H:%M:%S") for s in slots]
    }

@app.post("/check-availability")
def check_availability(req: AvailabilityRequest, db: Session = Depends(get_db)):
    try: req_dt = datetime.strptime(req.requested_time, "%Y-%m-%d %H:%M:%S")
    except: return {"is_valid": False, "reason": "Invalid format.", "suggestions": []}

    date_obj = req_dt.date()
    now = datetime.now()
    
    if req_dt < now:
        return {"is_valid": False, "reason": "You cannot book an appointment in the past.", "suggestions": []}

    doc, slots = get_best_doctor_for_date(db, req.clinic_id, date_obj, req.duration, req.doctor_pref)
    
    if not doc:
        sugs = []
        for i in range(1, 7):
            d = date_obj + timedelta(days=i)
            s_doc, s_slots = get_best_doctor_for_date(db, req.clinic_id, d, req.duration, req.doctor_pref)
            if s_slots:
                sugs.extend([s.strftime("%Y-%m-%d %H:%M:%S") for s in s_slots[:3]])
                break
        return {"is_valid": False, "reason": "No doctors matching your preference have free slots on that day.", "suggestions": sugs[:3]}

    if req_dt in slots:
        return {
            "is_valid": True, 
            "reason": "Slot available.", 
            "doctor_id": str(doc.id), 
            "doctor_name": doc.name,
            "suggestions": []
        }
    else:
        sugs = [s.strftime("%Y-%m-%d %H:%M:%S") for s in slots[:3]]
        return {
            "is_valid": False, 
            "reason": f"That exact time is unavailable for {doc.name}.", 
            "suggestions": sugs
        }

@app.post("/book-appointment")
def book_appointment(booking: Booking, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(
        models.Patient.clinic_id == booking.clinic_id, 
        models.Patient.ic_passport_number == booking.ic_passport_number
    ).first()
    if not patient: raise HTTPException(status_code=404, detail="Patient profile not found")

    mapped_appt_type = 'single-visit'
    total_stages = 1
    if booking.service_type == 'Vaccine':
        dose_text = str(booking.details.get('dose', ''))
        if dose_text.startswith('Dose'):
            mapped_appt_type = 'multi-stage'
            total_stages = booking.details.get('total_doses', 1)

    # Retrieves the pre-assigned doctor ID saved by bot.py
    doc_id = booking.details.get('assigned_doctor_id')

    new_appt = models.Appointment(
        clinic_id=booking.clinic_id,
        patient_id=patient.id,
        doctor_id=doc_id,
        appt_type=mapped_appt_type,
        total_stages=total_stages, 
        details=booking.details
    )
    db.add(new_appt)
    db.commit()

    new_stage = models.ApptStage(
        appointment_id=new_appt.id,
        stage_name=booking.details.get("dose", booking.service_type), 
        scheduled_time=datetime.strptime(booking.scheduled_time, "%Y-%m-%d %H:%M:%S")
    )
    db.add(new_stage)
    db.commit()
    return {"status": "success"}