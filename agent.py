import os
import json
import re
import requests
import urllib3
from typing import TypedDict, List, Optional
from langgraph.graph import StateGraph, END
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# --- LOAD ENV VARIABLES ---
load_dotenv()

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '').strip()
if not GEMINI_API_KEY:
    GEMINI_API_KEY = os.getenv('GOOGLE_API_KEY', '').strip()

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# --- AI Extraction Logic ---
class AppointmentExtraction(BaseModel):
    intent: str = Field(description="Must be either 'booking' or 'reschedule'")
    date_preference: Optional[str] = Field(description="Extracted date in strictly YYYY-MM-DD format, or null if missing.")
    time_preference: Optional[str] = Field(description="Extracted time in strictly HH:MM:SS format (24-hour), or null if missing.")
    doctor_preference: Optional[str] = Field(description="Name of the preferred doctor, or null if missing.")
    reason: Optional[str] = Field(description="Extracted reason for visit or any free text details, or null.") # ADDED

def extract_appointment_details(user_text: str, current_time_str: str):
    if not GEMINI_API_KEY:
        return {"error": "Server missing GEMINI_API_KEY in .env file."}

    prompt = f"""
    You are an AI Clinic Assistant extracting data. The current date and time is {current_time_str}. 
    If the user uses relative terms like 'tomorrow' or 'next monday', calculate the exact YYYY-MM-DD date. 
    Convert times like '5pm' into 17:00:00.
    
    User Text: "{user_text}"

    Extract the information into the following strictly valid JSON format. Return ONLY the JSON object, with no markdown formatting and no conversational text:
    {{
        "intent": "booking",
        "date_preference": "YYYY-MM-DD",
        "time_preference": "HH:MM:SS",
        "doctor_preference": "Dr. Name",
        "reason": "General Checkup"
    }}
    """

    headers = {'Content-Type': 'application/json'}
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"response_mime_type": "application/json"},
        "safetySettings": [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"}
        ]
    }

    api_versions = ["v1beta", "v1"]
    valid_models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-flash-latest"]
    errors = []

    for version in api_versions:
        for model in valid_models:
            url = f"https://generativelanguage.googleapis.com/{version}/models/{model}:generateContent?key={GEMINI_API_KEY}"
            try:
                response = requests.post(url, headers=headers, json=payload, timeout=15, verify=False)
                if response.status_code == 200:
                    result = response.json()
                    if 'candidates' in result and len(result['candidates']) > 0:
                        raw_text = result['candidates'][0]['content']['parts'][0]['text'].strip()
                        json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
                        if not json_match:
                            return {"error": "AI did not return a valid JSON object."}
                        
                        clean_json = json_match.group(0)
                        parsed_data = json.loads(clean_json)
                        return AppointmentExtraction(**parsed_data)
                else:
                    errors.append(f"{version}/{model} ({response.status_code})")
            except Exception as e:
                errors.append(f"{version}/{model} Exception")
                continue 
            
    return {"error": f"All endpoints failed. Traces: {', '.join(errors)}"}

# --- Scheduling Agent Logic ---
class AgentState(TypedDict):
    requested_time: str
    is_valid: bool
    reason: str
    suggestions: List[str]

def scheduling_agent_node(state: AgentState):
    try:
        req_dt = datetime.strptime(state['requested_time'], "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return {"is_valid": False, "reason": "Invalid format.", "suggestions": []}

    now = datetime.now()
    if req_dt < now:
        return {"is_valid": False, "reason": "You cannot book an appointment in the past.", "suggestions": []}

    if req_dt.hour < 9 or req_dt.hour > 17 or (req_dt.hour == 17 and req_dt.minute > 0):
        return {
            "is_valid": False, 
            "reason": "Clinic is only open 09:00 - 17:00.",
            "suggestions": [req_dt.replace(hour=9, minute=0, second=0).strftime("%Y-%m-%d %H:%M:%S")]
        }

    if req_dt.weekday() == 6: # Sunday
        next_mon = (req_dt + timedelta(days=1)).replace(hour=9, minute=0, second=0)
        return {"is_valid": False, "reason": "Closed on Sundays.", "suggestions": [next_mon.strftime("%Y-%m-%d %H:%M:%S")]}

    return {"is_valid": True, "reason": "Slot available.", "suggestions": []}

workflow = StateGraph(AgentState)
workflow.add_node("check_schedule", scheduling_agent_node)
workflow.set_entry_point("check_schedule")
workflow.add_edge("check_schedule", END)
scheduling_agent = workflow.compile()