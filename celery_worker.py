import os
import httpx
import logging
from celery import Celery
from celery.schedules import crontab
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from database import SessionLocal
import models
from dotenv import load_dotenv

load_dotenv()
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_API_URL = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"

celery_app = Celery("clinic_tasks", broker="redis://localhost:6379/0")

# Run the Reminder Agent daily at 8:00 AM
celery_app.conf.beat_schedule = {
    'daily-reminder-agent': {
        'task': 'celery_worker.run_reminder_agent',
        'schedule': crontab(hour=8, minute=0),
    },
}

@celery_app.task
def run_reminder_agent():
    """Reminder Agent: Scans for appointments tomorrow and notifies patients."""
    db: Session = SessionLocal()
    tomorrow_start = datetime.now().replace(hour=0, minute=0, second=0) + timedelta(days=1)
    tomorrow_end = tomorrow_start + timedelta(days=1)

    try:
        # Find all appt_stages scheduled for tomorrow
        upcoming_stages = db.query(models.ApptStage, models.Appointment, models.Patient).join(
            models.Appointment, models.ApptStage.appointment_id == models.Appointment.id
        ).join(
            models.Patient, models.Appointment.patient_ic == models.Patient.ic_passport_number
        ).filter(
            models.ApptStage.scheduled_time >= tomorrow_start,
            models.ApptStage.scheduled_time < tomorrow_end,
            models.ApptStage.status == 'scheduled'
        ).all()

        for stage, appt, patient in upcoming_stages:
            if not patient.telegram_id: continue

            # Format the Reminder Message
            msg = (f"🔔 *Appointment Reminder*\n\n"
                   f"Hello {patient.name}, this is a reminder for your upcoming clinic visit.\n\n"
                   f"Service: {stage.stage_name}\n"
                   f"Date: {stage.scheduled_time.strftime('%Y-%m-%d')}\n"
                   f"Time: {stage.scheduled_time.strftime('%H:%M %p')}\n\n"
                   f"Please reply 'Confirm' or use /status to reschedule.")

            # Send via Telegram API
            response = httpx.post(TELEGRAM_API_URL, json={
                "chat_id": patient.telegram_id,
                "text": msg,
                "parse_mode": "Markdown"
            })

            if response.status_code == 200:
                # Log the agent's action
                log = models.AgentLog(
                    clinic_id=appt.clinic_id, 
                    action="Reminder Sent", 
                    reasoning=f"Sent automated 1-day reminder to {patient.ic_passport_number} for stage {stage.id}"
                )
                db.add(log)
        db.commit()

    except Exception as e:
        logging.error(f"Reminder Agent failed: {e}")
    finally:
        db.close()