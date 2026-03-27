from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
from pydantic import BaseModel
from typing import Dict, Any, Optional
from agent import scheduling_agent, extract_appointment_details
from datetime import datetime
import uuid

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

@app.post("/ai-extract")
def ai_extract(req: TextExtractRequest):
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    extracted = extract_appointment_details(req.text, now_str)
    if isinstance(extracted, dict) and "error" in extracted:
        return extracted
    return extracted.dict()

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

@app.post("/check-availability")
def check_availability(requested_time: str):
    return scheduling_agent.invoke({"requested_time": requested_time})

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

    new_appt = models.Appointment(
        clinic_id=booking.clinic_id,
        patient_id=patient.id,
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