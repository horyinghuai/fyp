import os
import json
import re
import asyncio
import httpx
from typing import TypedDict, List, Optional
from langgraph.graph import StateGraph, END
from datetime import datetime, timedelta
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()
LOCAL_LLM_BASE_URL = os.getenv('LOCAL_LLM_BASE_URL', 'http://localhost:1234/v1')
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# --- TRUE ASYNC RACE STRATEGY ---
async def fetch_local_llm(prompt: str) -> str:
    async with httpx.AsyncClient() as client:
        payload = {"model": "local-model", "messages": [{"role": "user", "content": prompt}], "temperature": 0.0}
        url = f"{LOCAL_LLM_BASE_URL}/chat/completions"
        res = await client.post(url, json=payload, timeout=45.0)
        res.raise_for_status()
        return res.json()["choices"][0]["message"]["content"].strip()

async def fetch_gemini(prompt: str) -> str:
    if not GEMINI_API_KEY:
        await asyncio.sleep(9999) 
        return ""
    async with httpx.AsyncClient() as client:
        # FIXED: Upgraded from the deprecated gemini-1.5-flash to the active gemini-2.5-flash
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
        payload = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.0}}
        res = await client.post(url, json=payload, timeout=30.0)
        res.raise_for_status()
        data = res.json()
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()

async def run_llm_race(prompt: str) -> str:
    """Runs Local and Gemini in parallel. Returns the FIRST successful response. Safely cancels the loser."""
    task_local = asyncio.create_task(fetch_local_llm(prompt), name="Local_LLM")
    task_gemini = asyncio.create_task(fetch_gemini(prompt), name="Gemini_LLM")
    
    pending = {task_local, task_gemini}

    while pending:
        done, pending = await asyncio.wait(
            pending,
            return_when=asyncio.FIRST_COMPLETED
        )

        for task in done:
            try:
                # Check if this completed task succeeded
                result = task.result()
                
                # If we get here, it succeeded! Cancel all remaining pending tasks safely.
                for p in pending:
                    p.cancel()
                    
                return result
            except Exception as e:
                # Task failed. Print the error type and message for better debugging.
                print(f"[{task.get_name()}] failed: {type(e).__name__} - {str(e)}. Falling back...")
                
                if not pending:
                    raise Exception("Both LLMs failed. Check your Local LLM server and Gemini API Key.")

    raise Exception("All LLM tasks failed unexpectedly.")

# --- DATE CALCULATOR ---
def calculate_exact_datetime(raw_date_text: str, raw_time_text: str, current_time_str: str):
    now = datetime.strptime(current_time_str, "%Y-%m-%d %H:%M:%S")
    final_date = None
    final_time = None

    if raw_date_text:
        dt_str = raw_date_text.lower().strip()
        if re.match(r'\d{4}-\d{2}-\d{2}', dt_str): final_date = dt_str
        elif match := re.search(r'(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?', dt_str):
            d, m, y = match.groups()
            if not y:
                y = now.year
                if int(m) < now.month: y += 1
            elif len(y) == 2: y = int(y) + 2000
            final_date = f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
        elif "today" in dt_str: final_date = now.strftime("%Y-%m-%d")
        elif "tomorrow" in dt_str: final_date = (now + timedelta(days=1)).strftime("%Y-%m-%d")
        elif match := re.search(r'in (\d+) day', dt_str):
            days_ahead = int(match.group(1))
            final_date = (now + timedelta(days=days_ahead)).strftime("%Y-%m-%d")
        else:
            days_of_week = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
            for i, day in enumerate(days_of_week):
                if day in dt_str:
                    days_ahead = i - now.weekday()
                    if days_ahead <= 0 or "next" in dt_str: days_ahead += 7
                    final_date = (now + timedelta(days=days_ahead)).strftime("%Y-%m-%d")
                    break

    if raw_time_text:
        tt_str = raw_time_text.lower().strip().replace('.', ':')
        if re.match(r'\d{2}:\d{2}:\d{2}', tt_str): final_time = tt_str
        elif match := re.search(r'(\d{1,2})(?::(\d{2}))?\s*(am|pm)?', tt_str):
            h, m, ampm = int(match.group(1)), int(match.group(2) or 0), match.group(3)
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

async def extract_appointment_details(user_text: str, current_time_str: str):
    prompt = f"""
    You are a strict JSON API. Extract details from the user's text.
    USER TEXT: "{user_text}"
    
    CRITICAL INSTRUCTIONS:
    - DO NOT output <think> tags. Output ONLY raw JSON.
    - If the user uses relative words like "next monday", "tomorrow", "this friday", you MUST extract those exact words into `raw_date_text`. Do NOT return null if a day is mentioned.
    
    {{
        "intent": "booking",
        "raw_date_text": "extracted exact date words or null",
        "raw_time_text": "extracted exact time words or null",
        "doctor_preference": "Dr. Name or null",
        "reason": "Extracted reason or null"
    }}
    """
    try:
        raw_text = await run_llm_race(prompt)
        json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        llm_data = json.loads(json_match.group(0)) if json_match else json.loads(raw_text)
        
        calculated_date, calculated_time = calculate_exact_datetime(llm_data.get("raw_date_text"), llm_data.get("raw_time_text"), current_time_str)
        return AppointmentExtraction(intent=llm_data.get("intent", "booking"), date_preference=calculated_date, time_preference=calculated_time, doctor_preference=llm_data.get("doctor_preference"), reason=llm_data.get("reason"))
    except Exception as e:
        return {"error": f"AI Parsing Error: {str(e)}"}

async def generate_vaccine_schedule_ai(search_query: str):
    prompt = f"""
    You are a strict Medical Database JSON API. The user entered: "{search_query}".
    
    1. If it is a generic disease (e.g., "COVID", "Flu", "Hepatitis"): Return status "multiple_options" and a list of 3-5 specific vaccine brand names in "options".
    2. If it is a specific vaccine brand (e.g., "Pfizer", "Twinrix"): Return status "exact_match", and provide its medical type, total doses, booster status, and interval schedules.
    3. If it is unrecognized or fake: Return status "invalid".
    
    CRITICAL INSTRUCTION: Output ONLY raw valid JSON. DO NOT output conversational text. DO NOT output <think> tags.
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
        raw_text = await run_llm_race(prompt)
        json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        return json.loads(json_match.group(0)) if json_match else json.loads(raw_text)
    except Exception as e:
        return {"error": f"AI Request failed: {str(e)}"}

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