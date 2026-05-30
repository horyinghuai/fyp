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

celery_app.conf.beat_schedule = {
    'daily-reminder-agent': {
        'task': 'celery_worker.run_reminder_agent',
        'schedule': crontab(hour=8, minute=0),
    },
}

def send_sms_sync(to_phone: str, message: str):
    mocean_token = os.getenv("MOCEAN_API_TOKEN")
    plivo_auth_id = os.getenv("PLIVO_AUTH_ID")
    plivo_auth_token = os.getenv("PLIVO_AUTH_TOKEN")
    plivo_from = os.getenv("PLIVO_FROM_NUMBER", "AICAS")

    clean_phone = to_phone.replace("+", "")

    # 1. Try MoceanAPI (Main) using Bearer Token
    if mocean_token:
        try:
            res = httpx.post(
                "https://rest.moceanapi.com/rest/2/sms",
                headers={
                    "Authorization": f"Bearer {mocean_token}",
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                data={
                    "mocean-to": clean_phone,
                    "mocean-from": "AICAS",
                    "mocean-text": message
                },
                timeout=5.0
            )
            if res.status_code == 200: return True
        except: pass

    # 2. Try Plivo (Backup)
    if plivo_auth_id and plivo_auth_token:
        try:
            res = httpx.post(
                f"https://api.plivo.com/v1/Account/{plivo_auth_id}/Message/",
                auth=(plivo_auth_id, plivo_auth_token),
                json={"src": plivo_from, "dst": clean_phone, "text": message},
                timeout=5.0
            )
            if res.status_code in [200, 202]: return True
        except: pass
        
    return False

@celery_app.task
def run_reminder_agent():
    """Reminder Agent: Scans for appointments tomorrow and notifies patients via Telegram or SMS."""
    db: Session = SessionLocal()
    tomorrow_start = datetime.now().replace(hour=0, minute=0, second=0) + timedelta(days=1)
    tomorrow_end = tomorrow_start + timedelta(days=1)

    try:
        upcoming_stages = db.query(models.ApptStage, models.Appointment, models.Patient).join(
            models.Appointment, models.ApptStage.appointment_id == models.Appointment.id
        ).join(
            models.Patient, models.Appointment.patient_id == models.Patient.id
        ).filter(
            models.ApptStage.scheduled_time >= tomorrow_start,
            models.ApptStage.scheduled_time < tomorrow_end,
            models.ApptStage.status == 'scheduled'
        ).all()

        for stage, appt, patient in upcoming_stages:
            is_blood_test = db.query(models.AppointmentBloodTest).filter_by(appointment_id=appt.id).first() is not None
            
            msg = (f"🔔 *Appointment Reminder*\n\n"
                   f"Hello {patient.name}, this is a reminder for your upcoming clinic visit tomorrow.\n\n"
                   f"Service: {stage.stage_name}\n"
                   f"Date: {stage.scheduled_time.strftime('%Y-%m-%d')}\n"
                   f"Time: {stage.scheduled_time.strftime('%H:%M %p')}\n\n")

            if is_blood_test:
                msg += "⚠️ Kindly ensure that you fast for at least 9 hours before your blood test. You are advised not to consume any food or drinks except plain water during the fasting period.\n\n"

            msg += "If there are any changes to be made, please contact the clinic ASAP."

            if patient.telegram_id:
                keyboard = {
                    "inline_keyboard": [
                        [{"text": "✅ Confirm", "callback_data": f"rem_conf_{stage.id}"}],
                        [{"text": "✏️ Modify", "callback_data": f"rem_mod_{stage.id}"},
                         {"text": "❌ Cancel", "callback_data": f"rem_can_{stage.id}"}]
                    ]
                }
                response = httpx.post(TELEGRAM_API_URL, json={
                    "chat_id": patient.telegram_id,
                    "text": msg,
                    "parse_mode": "Markdown",
                    "reply_markup": keyboard
                })
                success = response.status_code == 200
            else:
                success = send_sms_sync(patient.phone, msg.replace("*", ""))

            if success:
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