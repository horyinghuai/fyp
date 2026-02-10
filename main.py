from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
from agent import scheduling_agent
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

app = FastAPI(title="Clinic Staff Admin Portal")

# Updated Schema to include IC
class PatientRegister(BaseModel):
    name: str
    ic_number: str
    phone: str
    telegram_id: int

@app.get("/patient/{telegram_id}")
def get_patient(telegram_id: int, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(models.Patient.telegram_id == telegram_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient

@app.post("/register-patient")
def register_patient(data: PatientRegister, db: Session = Depends(get_db)):
    existing = db.query(models.Patient).filter(models.Patient.telegram_id == data.telegram_id).first()
    if existing:
        # Update existing details if they re-register
        existing.name = data.name
        existing.ic_number = data.ic_number
        existing.phone = data.phone
        db.commit()
        return {"message": "Details updated", "patient_id": existing.id}
    
    new_patient = models.Patient(
        name=data.name, 
        ic_number=data.ic_number,
        phone=data.phone, 
        telegram_id=data.telegram_id
    )
    db.add(new_patient)
    db.commit()
    db.refresh(new_patient)
    return {"message": "Registration successful", "patient_id": new_patient.id}

@app.post("/book-appointment")
def book_appointment(appt_type: str, requested_time: str, telegram_id: int, prev_status: str = "none", prev_time: Optional[str] = None, db: Session = Depends(get_db)):
    # 1. Validate with AI Agent
    result = scheduling_agent.invoke({
        "appt_type": appt_type,
        "requested_time": requested_time,
        "prev_stage_status": prev_status,
        "prev_stage_time": prev_time
    })
    
    if not result["is_valid"]:
        raise HTTPException(status_code=400, detail=result["reason"])
    
    # 2. If valid, save to DB
    patient = db.query(models.Patient).filter(models.Patient.telegram_id == telegram_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    new_appt = models.Appointment(patient_id=patient.id, appt_type=appt_type)
    db.add(new_appt)
    db.commit()
    
    # Add Stage
    new_stage = models.ApptStage(
        appointment_id=new_appt.id, 
        stage_name=appt_type, 
        scheduled_time=datetime.strptime(requested_time, "%Y-%m-%d %H:%M")
    )
    db.add(new_stage)
    db.commit()

    return {"message": "AI Agent approved. Appointment Booked.", "reason": result["reason"]}

@app.post("/reschedule-appointment")
def reschedule_appointment(telegram_id: int, new_time: str, db: Session = Depends(get_db)):
    # 1. Find the latest appointment
    patient = db.query(models.Patient).filter(models.Patient.telegram_id == telegram_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
        
    # Get latest active stage
    stage = db.query(models.ApptStage).join(models.Appointment).filter(
        models.Appointment.patient_id == patient.id,
        models.ApptStage.status == "scheduled"
    ).order_by(models.ApptStage.scheduled_time.desc()).first()

    if not stage:
        raise HTTPException(status_code=404, detail="No active appointment found to reschedule.")

    # 2. Consult AI Agent for the NEW time
    result = scheduling_agent.invoke({
        "appt_type": stage.stage_name,
        "requested_time": new_time,
        "prev_stage_status": "none", # Simplified for reschedule
        "prev_stage_time": None
    })

    if not result["is_valid"]:
        # Return the AI's reason/suggestion (e.g., "Clinic closed")
        raise HTTPException(status_code=400, detail=f"Modification Failed: {result['reason']}")

    # 3. Update DB
    stage.scheduled_time = datetime.strptime(new_time, "%Y-%m-%d %H:%M")
    db.commit()
    
    return {"message": "Appointment successfully rescheduled.", "new_time": new_time}

@app.delete("/cancel-appointment")
def cancel_appointment(telegram_id: int, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(models.Patient.telegram_id == telegram_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Find and delete the latest appointment
    appt = db.query(models.Appointment).filter(models.Appointment.patient_id == patient.id).order_by(models.Appointment.id.desc()).first()
    
    if not appt:
        raise HTTPException(status_code=404, detail="No appointment found to cancel.")

    db.delete(appt) # Cascade deletes stages
    db.commit()
    
    return {"message": "Appointment cancelled and removed from database."}

@app.get("/appointments")
def get_all_appointments(db: Session = Depends(get_db)):
    return db.query(models.Appointment).all()