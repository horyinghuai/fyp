from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
from pydantic import BaseModel
from typing import Dict, Any, List
from agent import scheduling_agent
from datetime import datetime

app = FastAPI(title="Clinic Smart Assistant Backend")

class Booking(BaseModel):
    telegram_id: int
    service_type: str
    details: Dict[str, Any]
    scheduled_time: str

@app.get("/vaccines")
def get_vaccines(db: Session = Depends(get_db)):
    return db.query(models.Vaccine).all()

@app.get("/blood-tests/{test_type}")
def get_blood_tests(test_type: str, db: Session = Depends(get_db)):
    return db.query(models.BloodTest).filter(models.BloodTest.test_type == test_type).all()

@app.get("/patient/ic/{ic}")
def get_patient_by_ic(ic: str, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(models.Patient.ic_number == ic).first()
    if not patient: raise HTTPException(status_code=404)
    return patient

@app.post("/register-patient")
def register_patient(data: Dict[str, Any], db: Session = Depends(get_db)):
    new_patient = models.Patient(**data)
    db.add(new_patient)
    db.commit()
    return {"status": "success"}

@app.post("/check-availability")
def check_availability(requested_time: str):
    result = scheduling_agent.invoke({"requested_time": requested_time})
    return result

@app.post("/book-appointment")
def book_appointment(booking: Booking, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(models.Patient.telegram_id == booking.telegram_id).first()
    if not patient: raise HTTPException(status_code=404)

    new_appt = models.Appointment(
        patient_id=patient.id,
        appt_type=booking.service_type,
        details=booking.details
    )
    db.add(new_appt)
    db.commit()

    new_stage = models.ApptStage(
        appointment_id=new_appt.id,
        stage_name=booking.service_type,
        scheduled_time=datetime.strptime(booking.scheduled_time, "%Y-%m-%d %H:%M")
    )
    db.add(new_stage)
    db.commit()
    return {"status": "success"}