from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from .database import get_db
from . import models
from .agent import scheduling_agent # Import your agent

app = FastAPI(title="Clinic Staff Admin Portal")

@app.get("/appointments")
def get_all_appointments(db: Session = Depends(get_db)):
    return db.query(models.Appointment).all()

@app.post("/book-appointment")
def book_appointment(appt_type: str, requested_time: str, prev_status: str = "none"):
    # Trigger AI Agent Validation
    result = scheduling_agent.invoke({
        "appt_type": appt_type,
        "requested_time": requested_time,
        "prev_stage_status": prev_status
    })
    
    if not result["is_valid"]:
        raise HTTPException(status_code=400, detail=result["reason"])
    
    return {"message": "AI Agent approved the appointment.", "reason": result["reason"]}

@app.post("/override/{stage_id}")
def manual_override(stage_id: str, new_status: str, db: Session = Depends(get_db)):
    stage = db.query(models.ApptStage).filter(models.ApptStage.id == stage_id).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    stage.status = new_status
    db.commit()
    return {"message": "Manual override successful"}