from celery import Celery
import requests

celery_app = Celery('tasks', broker='redis://localhost:6379/0')

@celery_app.task
def send_reminder(telegram_id, message):
    token = "YOUR_TELEGRAM_TOKEN"
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {"chat_id": telegram_id, "text": message}
    requests.post(url, json=payload)