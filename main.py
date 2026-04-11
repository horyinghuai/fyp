from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import get_db
import models
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from agent import extract_appointment_details
from datetime import datetime, timedelta
import random

app = FastAPI(title="Clinic Smart Assistant Backend")

# --- CORS SETUP ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- PYDANTIC SCHEMAS ---
class PatientRegister(BaseModel):
    clinic_id: str
    name: str
    ic_passport_number: str
    phone: str
    telegram_id: Optional[int] = None
    address: Optional[str] = None
    gender: Optional[str] = None
    nationality: Optional[str] = None

class PatientUpdate(BaseModel):
    name: str
    phone: str
    gender: str
    nationality: str

class VaccineCreate(BaseModel):
    clinic_id: str
    name: str
    type: str
    total_doses: int
    price: float
    has_booster: bool

class BloodTestCreate(BaseModel):
    clinic_id: str
    name: str
    description: str
    price: float
    test_type: str

class Booking(BaseModel):
    clinic_id: str
    telegram_id: int
    ic_passport_number: str 
    service_type: str
    details: Dict[str, Any]
    scheduled_time: str

class UpdateBooking(BaseModel):
    appt_id: str
    service_type: str
    details: Dict[str, Any]
    scheduled_time: str

class ChatMessageModel(BaseModel):
    clinic_id: str
    telegram_id: int
    message: str

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

class AdminChatReply(BaseModel):
    clinic_id: str
    question: str
    answer: str

# --- AI AGENT HELPERS ---
def logging_agent(db: Session, clinic_id: str, action: str, reasoning: str):
    log = models.AgentLog(clinic_id=clinic_id, action=action, reasoning=reasoning)
    db.add(log)
    db.commit()

def calculate_future_date(start_date: datetime, interval_str: str) -> datetime:
    interval_str = interval_str.lower()
    try:
        amount = int(''.join(filter(str.isdigit, interval_str)))
        if 'month' in interval_str: return start_date + timedelta(days=30 * amount)
        elif 'week' in interval_str: return start_date + timedelta(weeks=amount)
        elif 'year' in interval_str or 'annual' in interval_str: return start_date + timedelta(days=365 * amount)
        elif 'day' in interval_str: return start_date + timedelta(days=amount)
    except: pass
    return start_date + timedelta(days=30) 

# --- 1. DASHBOARD FIX (Manual Lookups to prevent SQLAlchemy Join Crashes) ---
@app.get("/admin/appointments/{clinic_id}")
def admin_get_all_appointments(clinic_id: str, db: Session = Depends(get_db)):
    try:
        appointments = db.query(models.Appointment).filter(models.Appointment.clinic_id == clinic_id).all()
        appt_ids = [a.id for a in appointments]
        if not appt_ids: return []
        
        stages = db.query(models.ApptStage).filter(models.ApptStage.appointment_id.in_(appt_ids)).all()
        
        appt_dict = {a.id: a for a in appointments}
        patient_ics = [a.patient_ic for a in appointments]
        patients = db.query(models.Patient).filter(models.Patient.ic_passport_number.in_(patient_ics)).all()
        patient_dict = {p.ic_passport_number: p for p in patients}
        
        doctor_ics = [a.doctor_ic for a in appointments if a.doctor_ic]
        doctors = db.query(models.Doctor).filter(models.Doctor.ic_passport_number.in_(doctor_ics)).all()
        doctor_dict = {d.ic_passport_number: d for d in doctors}

        result = []
        for stage in stages:
            appt = appt_dict.get(stage.appointment_id)
            if not appt: continue
            patient = patient_dict.get(appt.patient_ic)
            doctor = doctor_dict.get(appt.doctor_ic) if appt.doctor_ic else None

            color = "#3B82F6" 
            if appt.appt_type == "multi-stage": color = "#A855F7" 
            elif appt.appt_type == "follow-up": color = "#F97316" 

            result.append({
                "id": str(stage.id),
                "title": f"{patient.name if patient else 'Unknown'} - {stage.stage_name}",
                "start": stage.scheduled_time.isoformat(),
                "end": (stage.scheduled_time + timedelta(minutes=30)).isoformat(),
                "patient_ic": patient.ic_passport_number if patient else "",
                "doctor": doctor.name if doctor else "Unassigned",
                "type": appt.appt_type,
                "status": stage.status,
                "color": color
            })
        return result
    except Exception as e:
        print(f"DASHBOARD CRASH PREVENTED: {e}")
        return []

# --- 2. PATIENT CRUD ---
@app.get("/admin/patients/{clinic_id}")
def admin_get_patients(clinic_id: str, db: Session = Depends(get_db)):
    return db.query(models.Patient).filter(models.Patient.clinic_id == clinic_id).all()

@app.put("/admin/patients/{ic}")
def admin_update_patient(ic: str, data: PatientUpdate, db: Session = Depends(get_db)):
    p = db.query(models.Patient).filter_by(ic_passport_number=ic).first()
    if p:
        p.name, p.phone, p.gender, p.nationality = data.name, data.phone, data.gender, data.nationality
        db.commit()
    return {"status": "success"}

@app.delete("/admin/patients/{ic}")
def admin_delete_patient(ic: str, db: Session = Depends(get_db)):
    db.query(models.Patient).filter_by(ic_passport_number=ic).delete()
    db.commit()
    return {"status": "success"}

# --- 3. VACCINE CRUD ---
@app.post("/admin/vaccines")
def create_vaccine(data: VaccineCreate, db: Session = Depends(get_db)):
    v = models.Vaccine(name=data.name, type=data.type, total_doses=data.total_doses, has_booster=data.has_booster)
    db.add(v)
    db.commit()
    db.refresh(v)
    vc = models.VaccineClinic(vaccine_id=v.id, clinic_id=data.clinic_id, price=data.price, stock_quantity=100, low_stock_threshold=10)
    db.add(vc)
    db.commit()
    return {"status": "success"}

@app.put("/admin/vaccines/{v_id}")
def update_vaccine(v_id: int, data: VaccineCreate, db: Session = Depends(get_db)):
    v = db.query(models.Vaccine).filter_by(id=v_id).first()
    if v:
        v.name, v.type, v.total_doses, v.has_booster = data.name, data.type, data.total_doses, data.has_booster
    vc = db.query(models.VaccineClinic).filter_by(vaccine_id=v_id, clinic_id=data.clinic_id).first()
    if vc: vc.price = data.price
    db.commit()
    return {"status": "success"}

@app.delete("/admin/vaccines/{v_id}/{clinic_id}")
def delete_vaccine(v_id: int, clinic_id: str, db: Session = Depends(get_db)):
    db.query(models.VaccineClinic).filter_by(vaccine_id=v_id, clinic_id=clinic_id).delete()
    db.query(models.Vaccine).filter_by(id=v_id).delete()
    db.commit()
    return {"status": "success"}

# --- 4. BLOOD TEST CRUD ---
@app.post("/admin/blood-tests")
def create_bt(data: BloodTestCreate, db: Session = Depends(get_db)):
    bt = models.BloodTest(clinic_id=data.clinic_id, name=data.name, description=data.description, price=data.price, test_type=data.test_type)
    db.add(bt)
    db.commit()
    return {"status": "success"}

@app.put("/admin/blood-tests/{bt_id}")
def update_bt(bt_id: int, data: BloodTestCreate, db: Session = Depends(get_db)):
    bt = db.query(models.BloodTest).filter_by(id=bt_id).first()
    if bt:
        bt.name, bt.description, bt.price, bt.test_type = data.name, data.description, data.price, data.test_type
        db.commit()
    return {"status": "success"}

@app.delete("/admin/blood-tests/{bt_id}")
def delete_bt(bt_id: int, db: Session = Depends(get_db)):
    db.query(models.BloodTest).filter_by(id=bt_id).delete()
    db.commit()
    return {"status": "success"}

# --- 5. OTHER ADMIN ENDPOINTS ---
@app.post("/admin/auto-replies")
def admin_add_chatbot_reply(data: AdminChatReply, db: Session = Depends(get_db)):
    new_msg = models.ChatMessage(
        clinic_id=data.clinic_id,
        message=data.question,
        reply=data.answer,
        status='auto_rule'
    )
    db.add(new_msg)
    db.commit()
    logging_agent(db, data.clinic_id, "Automated Message Updated", f"Admin added rule for: {data.question}")
    return {"status": "success"}


# --- 6. CORE BOT & DATA ENDPOINTS ---
@app.post("/ai-extract")
def ai_extract(req: TextExtractRequest):
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    extracted = extract_appointment_details(req.text, now_str)
    if isinstance(extracted, dict) and "error" in extracted: return extracted
    return extracted.dict()

@app.post("/ask-admin")
def ask_admin(msg: ChatMessageModel, db: Session = Depends(get_db)):
    new_msg = models.ChatMessage(clinic_id=msg.clinic_id, telegram_id=msg.telegram_id, message=msg.message)
    db.add(new_msg)
    db.commit()
    return {"status": "success"}

@app.get("/clinic/{clinic_id}")
def get_clinic(clinic_id: str, db: Session = Depends(get_db)):
    clinic = db.query(models.Clinic).filter(models.Clinic.id == clinic_id).first()
    if not clinic: raise HTTPException(status_code=404)
    return clinic

@app.get("/doctors/{clinic_id}")
def get_doctors(clinic_id: str, db: Session = Depends(get_db)):
    doctors = db.query(models.Doctor).join(
        models.DoctorClinicAvailability, 
        models.Doctor.ic_passport_number == models.DoctorClinicAvailability.doctor_ic
    ).filter(models.DoctorClinicAvailability.clinic_id == clinic_id).distinct().all()
    return doctors

@app.get("/vaccines/{clinic_id}")
def get_vaccines(clinic_id: str, db: Session = Depends(get_db)):
    results = db.query(
        models.Vaccine.id, models.Vaccine.name, models.Vaccine.type, 
        models.Vaccine.total_doses, models.Vaccine.has_booster, 
        models.VaccineClinic.price
    ).join(
        models.VaccineClinic, models.Vaccine.id == models.VaccineClinic.vaccine_id
    ).filter(models.VaccineClinic.clinic_id == clinic_id).all()
    
    vaccines = []
    for r in results:
        vaccines.append({
            "id": r.id, "name": r.name, "type": r.type,
            "total_doses": r.total_doses, "has_booster": r.has_booster,
            "price": float(r.price)
        })
    return vaccines

@app.get("/blood-tests/{clinic_id}/{test_type}")
def get_blood_tests(clinic_id: str, test_type: str, db: Session = Depends(get_db)):
    tests = db.query(models.BloodTest).filter(models.BloodTest.clinic_id == clinic_id, models.BloodTest.test_type == test_type).all()
    results = []
    for t in tests:
        t_dict = {"id": t.id, "name": t.name, "price": float(t.price), "description": t.description, "test_type": t.test_type}
        if test_type == "package":
            components = db.query(models.BloodTestComponent).filter(models.BloodTestComponent.package_id == t.id).all()
            included_names = []
            for comp in components:
                child = db.query(models.BloodTest).filter(models.BloodTest.id == comp.test_id).first()
                if child: included_names.append(child.name)
            t_dict["included_tests"] = included_names
        results.append(t_dict)
    return results

@app.get("/patient/{clinic_id}/id/{ic_passport}")
def get_patient_by_id(clinic_id: str, ic_passport: str, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(models.Patient.clinic_id == clinic_id, models.Patient.ic_passport_number == ic_passport).first()
    if not patient: raise HTTPException(status_code=404)
    return patient

@app.get("/patient/{clinic_id}/appointments/{ic}")
def get_patient_appointments(clinic_id: str, ic: str, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(models.Patient.clinic_id == clinic_id, models.Patient.ic_passport_number == ic).first()
    if not patient: raise HTTPException(status_code=404)
    
    now = datetime.now()
    appts = db.query(models.Appointment, models.ApptStage, models.Doctor).join(
        models.ApptStage, models.Appointment.id == models.ApptStage.appointment_id
    ).outerjoin(
        models.Doctor, models.Appointment.doctor_ic == models.Doctor.ic_passport_number
    ).filter(
        models.Appointment.patient_ic == patient.ic_passport_number,
        models.ApptStage.scheduled_time >= now,
        models.ApptStage.status != 'canceled'
    ).all()

    res = []
    for appt, stage, doc in appts:
        appt_vaccines = db.query(models.AppointmentVaccine).filter_by(appointment_id=appt.id).all()
        appt_tests = db.query(models.AppointmentBloodTest).filter_by(appointment_id=appt.id).all()
        
        service = "Others"
        item_names = []
        dose = None
        reason = appt.general_notes
        
        if appt_vaccines:
            service = "Vaccine"
            for av in appt_vaccines:
                dose = av.dose_number
                v = db.query(models.Vaccine).filter_by(id=av.vaccine_id).first()
                if v: item_names.append(v.name)
        elif appt_tests:
            service = "Blood Test"
            for at in appt_tests:
                bt = db.query(models.BloodTest).filter_by(id=at.blood_test_id).first()
                if bt: item_names.append(bt.name)
        elif reason:
            service = "Others"
                
        details_block = {
            "items": item_names,
            "dose": dose,
            "reason": reason,
            "assigned_doctor_name": doc.name if doc else "ANY",
            "assigned_doctor_id": str(doc.ic_passport_number) if doc else None,
            "service_type": service
        }

        res.append({
            "appt_id": str(appt.id),
            "service": service,
            "details": details_block,
            "date": stage.scheduled_time.strftime("%Y-%m-%d"),
            "time": stage.scheduled_time.strftime("%H:%M:%S"),
            "doctor_name": doc.name if doc else "ANY"
        })
    return res

@app.post("/register-patient")
def register_patient(data: PatientRegister, db: Session = Depends(get_db)):
    data_dict = data.dict(exclude_unset=True)
    existing = db.query(models.Patient).filter(
        models.Patient.clinic_id == data.clinic_id, 
        models.Patient.ic_passport_number == data.ic_passport_number
    ).first()
    
    if existing:
        for key, value in data_dict.items():
            if hasattr(existing, key): setattr(existing, key, value)
        db.commit()
        return {"status": "updated"}
        
    new_patient = models.Patient(**data_dict)
    db.add(new_patient)
    db.commit()
    return {"status": "success"}

# --- 7. AVAILABILITY & SCHEDULING ENDPOINTS ---
def get_doctors_and_slots_for_date(db: Session, clinic_id: str, date_obj: datetime.date, duration: int, doctor_pref: str):
    doc_query = db.query(models.Doctor).join(
        models.DoctorClinicAvailability, models.Doctor.ic_passport_number == models.DoctorClinicAvailability.doctor_ic
    ).filter(models.DoctorClinicAvailability.clinic_id == clinic_id)
    
    if doctor_pref == "MALE": doc_query = doc_query.filter(models.Doctor.gender == "MALE")
    elif doctor_pref == "FEMALE": doc_query = doc_query.filter(models.Doctor.gender == "FEMALE")
    elif doctor_pref and doctor_pref not in ["ANY", "MALE", "FEMALE"]:
        doc_query = doc_query.filter(models.Doctor.name == doctor_pref)

    valid_docs = doc_query.distinct().all()
    if not valid_docs: return []

    day_of_week = date_obj.strftime("%a").lower()[:3] 
    now = datetime.now()

    start_of_day = datetime.combine(date_obj, datetime.min.time())
    end_of_day = datetime.combine(date_obj, datetime.max.time())

    clashes = db.query(models.ApptStage.scheduled_time, models.Appointment.doctor_ic).join(
        models.Appointment).filter(
        models.Appointment.clinic_id == clinic_id,
        models.ApptStage.scheduled_time >= start_of_day,
        models.ApptStage.scheduled_time <= end_of_day
    ).all()

    clash_dict = {}
    for c_time, d_ic in clashes:
        if d_ic not in clash_dict: clash_dict[d_ic] = []
        clash_dict[d_ic].append(c_time)

    doc_slots = []

    for doc in valid_docs:
        availabilities = db.query(models.DoctorClinicAvailability).filter(
            models.DoctorClinicAvailability.doctor_ic == doc.ic_passport_number,
            models.DoctorClinicAvailability.clinic_id == clinic_id,
            models.DoctorClinicAvailability.day_of_week == day_of_week
        ).all()
        
        slots = []
        for avail in availabilities:
            if not avail.start_time or not avail.end_time: continue
            curr = datetime.combine(date_obj, avail.start_time)
            end_dt = datetime.combine(date_obj, avail.end_time)
            busy_times = clash_dict.get(doc.ic_passport_number, [])
            
            while curr < end_dt:
                if curr > now and curr not in busy_times:
                    slots.append(curr)
                curr += timedelta(minutes=duration)
                
        if slots:
            doc_slots.append({"doc": doc, "slots": slots, "free_count": len(slots)})

    return doc_slots

@app.post("/available-dates")
def get_available_dates(req: DateRequest, db: Session = Depends(get_db)):
    valid_dates = []
    today = datetime.now().date()
    for i in range(14):
        d = today + timedelta(days=i)
        doc_slots = get_doctors_and_slots_for_date(db, req.clinic_id, d, req.duration, req.doctor_pref)
        if doc_slots: valid_dates.append(d.strftime("%Y-%m-%d"))
    return valid_dates

@app.post("/available-times")
def get_available_times(req: TimeRequest, db: Session = Depends(get_db)):
    d_obj = datetime.strptime(req.date, "%Y-%m-%d").date()
    doc_slots = get_doctors_and_slots_for_date(db, req.clinic_id, d_obj, req.duration, req.doctor_pref)
    
    if not doc_slots: return {"error": "No slots available"}
    
    all_times = set()
    for ds in doc_slots:
        for s in ds['slots']:
            all_times.add(s.strftime("%H:%M:%S"))
            
    sorted_times = sorted(list(all_times))
    return {"times": sorted_times, "doctor_name": "Pending Selection"}

@app.post("/check-availability")
def check_availability(req: AvailabilityRequest, db: Session = Depends(get_db)):
    try: req_dt = datetime.strptime(req.requested_time, "%Y-%m-%d %H:%M:%S")
    except: return {"is_valid": False, "reason": "Invalid format.", "suggestions": []}

    date_obj = req_dt.date()
    now = datetime.now()
    
    def find_nearest_3_slots(start_date):
        sugs_set = set()
        for i in range(7):
            d = start_date + timedelta(days=i)
            if d < now.date(): continue
            d_slots = get_doctors_and_slots_for_date(db, req.clinic_id, d, req.duration, req.doctor_pref)
            for ds in d_slots:
                for s in ds['slots']:
                    if s > now:
                        sugs_set.add(s.strftime("%Y-%m-%d %H:%M:%S"))
                        if len(sugs_set) >= 3: return sorted(list(sugs_set))
            if len(sugs_set) >= 3: return sorted(list(sugs_set))
        return sorted(list(sugs_set))

    if req_dt < now:
        sugs = find_nearest_3_slots(now.date())
        return {"is_valid": False, "reason": "You cannot book an appointment in the past.", "suggestions": sugs}

    doc_slots = get_doctors_and_slots_for_date(db, req.clinic_id, date_obj, req.duration, req.doctor_pref)
    
    available_docs_for_this_slot = []
    for ds in doc_slots:
        if req_dt in ds['slots']: available_docs_for_this_slot.append(ds)
            
    if available_docs_for_this_slot:
        max_free = max(ds['free_count'] for ds in available_docs_for_this_slot)
        best_docs = [ds for ds in available_docs_for_this_slot if ds['free_count'] == max_free]
        chosen = random.choice(best_docs)
        return {"is_valid": True, "reason": "Slot available.", "doctor_id": str(chosen['doc'].ic_passport_number), "doctor_name": chosen['doc'].name, "suggestions": []}
    else:
        sugs = find_nearest_3_slots(date_obj)
        return {"is_valid": False, "reason": "That exact time is unavailable.", "suggestions": sugs}

@app.post("/book-appointment")
def book_appointment(booking: Booking, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(models.Patient.clinic_id == booking.clinic_id, models.Patient.ic_passport_number == booking.ic_passport_number).first()
    if not patient: raise HTTPException(status_code=404, detail="Patient missing")

    mapped_appt_type = 'single-visit'
    total_stages = 1
    v_model = None

    if booking.service_type == 'Vaccine':
        mapped_appt_type = 'multi-stage'
        items_list = booking.details.get('items', [])
        if items_list:
            v_model = db.query(models.Vaccine).filter_by(name=items_list[0]).first()
            if v_model: total_stages = v_model.total_doses

    doc_ic = booking.details.get('assigned_doctor_id')

    new_appt = models.Appointment(
        clinic_id=booking.clinic_id, patient_ic=patient.ic_passport_number, doctor_ic=doc_ic,
        appt_type=mapped_appt_type, total_stages=total_stages,
        general_notes=booking.details.get('reason') if booking.service_type == 'Others' else None
    )
    db.add(new_appt)
    db.flush() 

    start_time = datetime.strptime(booking.scheduled_time, "%Y-%m-%d %H:%M:%S")
    prev_stage_id = None

    if v_model and total_stages > 1:
        logging_agent(db, booking.clinic_id, "Vaccine Logic Triggered", f"Calculating {total_stages} doses for {v_model.name}.")
        db.add(models.AppointmentVaccine(appointment_id=new_appt.id, vaccine_id=v_model.id, dose_number="Multi-Dose Profile"))
        
        schedules = db.query(models.VaccineDoseSchedule).filter_by(vaccine_id=v_model.id).order_by(models.VaccineDoseSchedule.dose_number).all()
        current_calc_time = start_time
        
        for i in range(total_stages):
            stage_name = f"Dose {i+1}"
            if i > 0 and i < len(schedules):
                interval = schedules[i].interval_description
                current_calc_time = calculate_future_date(current_calc_time, interval)

            stage = models.ApptStage(
                appointment_id=new_appt.id, stage_name=stage_name, scheduled_time=current_calc_time, depends_on_stage_id=prev_stage_id
            )
            db.add(stage)
            db.flush()
            prev_stage_id = stage.id 
    else:
        if booking.service_type == 'Blood Test':
            for t_name in booking.details.get('items', []):
                bt = db.query(models.BloodTest).filter_by(name=t_name, clinic_id=booking.clinic_id).first()
                if bt: db.add(models.AppointmentBloodTest(appointment_id=new_appt.id, blood_test_id=bt.id))

        stage = models.ApptStage(
            appointment_id=new_appt.id, stage_name=booking.details.get("dose", booking.service_type), scheduled_time=start_time
        )
        db.add(stage)

    db.commit()
    return {"status": "success"}

@app.post("/update-appointment")
def update_appointment(booking: UpdateBooking, db: Session = Depends(get_db)):
    appt = db.query(models.Appointment).filter(models.Appointment.id == booking.appt_id).first()
    if not appt: raise HTTPException(status_code=404)
    
    db.query(models.ApptStage).filter(models.ApptStage.appointment_id == appt.id).delete()
    db.query(models.AppointmentVaccine).filter(models.AppointmentVaccine.appointment_id == appt.id).delete()
    db.query(models.AppointmentBloodTest).filter(models.AppointmentBloodTest.appointment_id == appt.id).delete()
    
    appt.doctor_ic = booking.details.get('assigned_doctor_id')
    appt.general_notes = booking.details.get('reason') if booking.service_type == 'Others' else None
    
    mapped_appt_type = 'single-visit'
    total_stages = 1
    if booking.service_type == 'Vaccine':
        dose_text = str(booking.details.get('dose', ''))
        if dose_text.startswith('Dose'):
            mapped_appt_type = 'multi-stage'
            total_stages = booking.details.get('total_doses', 1)
            
    appt.appt_type = mapped_appt_type
    appt.total_stages = total_stages
    
    service = booking.service_type
    items_list = booking.details.get('items', [])
    
    if service == 'Vaccine' and items_list:
        v = db.query(models.Vaccine).filter_by(name=items_list[0]).first()
        if v:
            db.add(models.AppointmentVaccine(
                appointment_id=appt.id, vaccine_id=v.id, dose_number=booking.details.get('dose')
            ))
    elif service == 'Blood Test' and items_list:
        for t_name in items_list:
            bt = db.query(models.BloodTest).filter_by(name=t_name).first()
            if bt:
                db.add(models.AppointmentBloodTest(appointment_id=appt.id, blood_test_id=bt.id))
    
    new_stage = models.ApptStage(
        appointment_id=appt.id, stage_name=booking.details.get("dose", booking.service_type),
        scheduled_time=datetime.strptime(booking.scheduled_time, "%Y-%m-%d %H:%M:%S")
    )
    db.add(new_stage)
    db.commit()
    return {"status": "success"}

@app.post("/cancel-appointment/{appt_id}")
def cancel_appointment(appt_id: str, db: Session = Depends(get_db)):
    db.query(models.ApptStage).filter(models.ApptStage.appointment_id == appt_id).update({"status": "canceled"})
    db.commit()
    return {"status": "success"}