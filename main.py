from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
from pydantic import BaseModel
from typing import Dict, Any, Optional
from celery_worker import send_reminder

app = FastAPI(title="Clinic Agent Dashboard")

class Registration(BaseModel):
    name: str
    ic_number: str
    phone: str
    telegram_id: int

class Booking(BaseModel):
    telegram_id: int
    service_type: str
    details: Dict[str, Any]

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
def register_patient(data: Registration, db: Session = Depends(get_db)):
    new_patient = models.Patient(**data.dict())
    db.add(new_patient)
    db.commit()
    return {"status": "success"}

@app.post("/book-appointment")
def book_appointment(booking: Booking, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(models.Patient.telegram_id == booking.telegram_id).first()
    if not patient: raise HTTPException(status_code=404, detail="Patient not registered")

    # 1. Vaccine Stock Validation
    if booking.service_type == "Vaccine":
        v_name = booking.details.get("vaccine_name")
        qty = booking.details.get("total_qty", 0)
        vaccine = db.query(models.Vaccine).filter(models.Vaccine.name == v_name).first()
        
        if vaccine.stock_quantity < qty:
            raise HTTPException(status_code=400, detail="Stock insufficient. Vaccine not available.")
        
        vaccine.stock_quantity -= qty
        if vaccine.stock_quantity <= vaccine.low_stock_threshold:
            # Notify Clinic (Using your TG ID or a fixed Clinic ID)
            send_reminder.delay(booking.telegram_id, f"STOCK ALERT: {v_name} is low ({vaccine.stock_quantity} remaining).")

    # 2. Save Appointment
    new_appt = models.Appointment(patient_id=patient.id, appt_type=booking.service_type, details=booking.details)
    db.add(new_appt)
    db.commit()
    return {"message": "Success"}

@app.delete("/cancel-appointment")
def cancel_appointment(telegram_id: int, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(models.Patient.telegram_id == telegram_id).first()
    if not patient: raise HTTPException(status_code=404)
    appt = db.query(models.Appointment).filter(models.Appointment.patient_id == patient.id).first()
    if appt:
        db.delete(appt)
        db.commit()
        return {"message": "Appointment cancelled successfully."}
    raise HTTPException(status_code=404, detail="No appointment found.")