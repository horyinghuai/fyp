import os
import requests
from dotenv import load_dotenv
from celery import Celery

# 1. Load environment variables
load_dotenv()

# 2. Retrieve the token securely
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

# Initialize Celery (Ensure Redis is running on localhost:6379)
celery_app = Celery('tasks', broker='redis://localhost:6379/0')

@celery_app.task
def send_reminder(telegram_id, message):
    """
    Sends a push notification to the user via Telegram.
    """
    if not TOKEN:
        print("Error: TELEGRAM_BOT_TOKEN is missing.")
        return

    url = f"https://api.telegram.org/bot{TOKEN}/sendMessage"
    payload = {
        "chat_id": telegram_id, 
        "text": message
    }
    
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status() # Raise an error for bad responses (4xx, 5xx)
        print(f"Reminder sent to {telegram_id}")
    except requests.exceptions.RequestException as e:
        print(f"Failed to send reminder: {e}")