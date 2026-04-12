import os
import json
import re
from typing import TypedDict, List, Optional
from langgraph.graph import StateGraph, END
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
LOCAL_LLM_BASE_URL = os.getenv('LOCAL_LLM_BASE_URL', 'http://localhost:1234/v1')
client = OpenAI(base_url=LOCAL_LLM_BASE_URL, api_key='lm-studio')

def calculate_exact_datetime(raw_date_text: str, raw_time_text: str, current_time_str: str):
    now = datetime.strptime(current_time_str, "%Y-%m-%d %H:%M:%S")
    final_date = None
    final_time = None

    if raw_date_text:
        dt_str = raw_date_text.lower().strip()
        if re.match(r'\d{4}-\d{2}-\d{2}', dt_str):
            final_date = dt_str
        elif match := re.search(r'(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?', dt_str):
            d, m, y = match.groups()
            if not y:
                y = now.year
                if int(m) < now.month: y += 1
            elif len(y) == 2: y = int(y) + 2000
            final_date = f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
        elif "today" in dt_str:
            final_date = now.strftime("%Y-%m-%d")
        elif "tomorrow" in dt_str:
            final_date = (now + timedelta(days=1)).strftime("%Y-%m-%d")
        elif match := re.search(r'in (\d+) day', dt_str):
            days_ahead = int(match.group(1))
            final_date = (now + timedelta(days=days_ahead)).strftime("%Y-%m-%d")
        else:
            days_of_week = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
            for i, day in enumerate(days_of_week):
                if day in dt_str:
                    current_weekday = now.weekday()
                    target_weekday = i
                    days_ahead = target_weekday - current_weekday
                    if days_ahead <= 0 or "next" in dt_str: days_ahead += 7
                    final_date = (now + timedelta(days=days_ahead)).strftime("%Y-%m-%d")
                    break

    if raw_time_text:
        tt_str = raw_time_text.lower().strip().replace('.', ':')
        if re.match(r'\d{2}:\d{2}:\d{2}', tt_str):
            final_time = tt_str
        elif match := re.search(r'(\d{1,2})(?::(\d{2}))?\s*(am|pm)?', tt_str):
            h = int(match.group(1))
            m = int(match.group(2) or 0)
            ampm = match.group(3)
            if ampm == 'pm' and h < 12: h += 12
            elif ampm == 'am' and h == 12: h = 0
            final_time = f"{h:02d}:{m:02d}:00"

    return final_date, final_time

class AppointmentExtraction(BaseModel):
    intent: str
    date_preference: Optional[str]
    time_preference: Optional[str]
    doctor_preference: Optional[str]
    reason: Optional[str]

def extract_appointment_details(user_text: str, current_time_str: str):
    # SPEED OPTIMIZATION: Forced strict JSON to bypass deepseek-r1 thinking overhead
    prompt = f"""
    You are a strict JSON API. Extract the exact date and time words from the user's text.
    USER TEXT: "{user_text}"
    
    CRITICAL INSTRUCTION: DO NOT output any <think> tags. DO NOT output explanations. Output ONLY raw valid JSON.
    {{
        "intent": "booking",
        "raw_date_text": "extracted exact date words or null",
        "raw_time_text": "extracted exact time words or null",
        "doctor_preference": "Dr. Name or null",
        "reason": "Extracted reason or null"
    }}
    """
    try:
        response = client.chat.completions.create(
            model="local-model", 
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0 
        )
        raw_text = response.choices[0].message.content.strip()
        json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        llm_data = json.loads(json_match.group(0)) if json_match else json.loads(raw_text)
        
        calculated_date, calculated_time = calculate_exact_datetime(llm_data.get("raw_date_text"), llm_data.get("raw_time_text"), current_time_str)
        return AppointmentExtraction(intent=llm_data.get("intent", "booking"), date_preference=calculated_date, time_preference=calculated_time, doctor_preference=llm_data.get("doctor_preference"), reason=llm_data.get("reason"))
    except Exception as e:
        return {"error": f"LM Studio Request failed: {str(e)}"}

def generate_vaccine_schedule_ai(search_query: str):
    # SPEED OPTIMIZATION & VACCINE TYPE SEARCH LOGIC
    prompt = f"""
    You are a strict Medical Database JSON API. The user entered: "{search_query}".
    
    RULES:
    1. If it is a generic disease/type (e.g., "COVID", "Flu", "Hepatitis"): Return status "multiple_options" and a list of 3-5 specific vaccine brand names in "options".
    2. If it is a specific vaccine brand (e.g., "Pfizer", "Twinrix"): Return status "exact_match", and provide its medical type, total doses, booster status, and interval schedules.
    3. If it is completely unrecognized/fake: Return status "invalid".
    
    CRITICAL INSTRUCTION: DO NOT output <think> tags. Output ONLY raw valid JSON.
    {{
        "status": "exact_match", 
        "options": ["Brand A", "Brand B"], 
        "type": "mRNA", 
        "total_doses": 2, 
        "has_booster": true, 
        "schedules": [
            {{"dose_number": 2, "interval_description": "1 month"}}
        ] 
    }}
    """
    try:
        response = client.chat.completions.create(
            model="local-model", 
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0 
        )
        raw_text = response.choices[0].message.content.strip()
        json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        return json.loads(json_match.group(0)) if json_match else json.loads(raw_text)
    except Exception as e:
        return {"error": f"LM Studio Request failed: {str(e)}"}

class AgentState(TypedDict):
    requested_time: str
    is_valid: bool
    reason: str
    suggestions: List[str]

def scheduling_agent_node(state: AgentState):
    try: req_dt = datetime.strptime(state['requested_time'], "%Y-%m-%d %H:%M:%S")
    except ValueError: return {"is_valid": False, "reason": "Invalid format.", "suggestions": []}
    now = datetime.now()
    if req_dt < now: return {"is_valid": False, "reason": "You cannot book an appointment in the past.", "suggestions": []}
    if req_dt.hour < 9 or req_dt.hour > 17 or (req_dt.hour == 17 and req_dt.minute > 0):
        return {"is_valid": False, "reason": "Clinic is only open 09:00 - 17:00.", "suggestions": [req_dt.replace(hour=9, minute=0, second=0).strftime("%Y-%m-%d %H:%M:%S")]}
    if req_dt.weekday() == 6:
        next_mon = (req_dt + timedelta(days=1)).replace(hour=9, minute=0, second=0)
        return {"is_valid": False, "reason": "Closed on Sundays.", "suggestions": [next_mon.strftime("%Y-%m-%d %H:%M:%S")]}
    return {"is_valid": True, "reason": "Slot available.", "suggestions": []}

workflow = StateGraph(AgentState)
workflow.add_node("check_schedule", scheduling_agent_node)
workflow.set_entry_point("check_schedule")
workflow.add_edge("check_schedule", END)
scheduling_agent = workflow.compile()