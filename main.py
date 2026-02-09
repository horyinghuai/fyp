from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from .database import get_db
from . import models # Assuming your models are in models.py

app = FastAPI(title="Clinic Staff Admin Portal")

@app.get("/appointments")
def get_all_appointments(db: Session = Depends(get_db)):
    return db.query(models.Appointment).all()

@app.post("/override/{stage_id}")
def manual_override(stage_id: str, new_status: str, db: Session = Depends(get_db)):
    stage = db.query(models.ApptStage).filter(models.ApptStage.id == stage_id).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    stage.status = new_status
    db.commit()
    return {"message": "Manual override successful"}