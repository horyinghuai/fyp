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

load_dotenv(override=True)
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
        # ← Use a valid model name (gemini-2.0-flash or gemini-1.5-flash)
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.0,
                "responseMimeType": "application/json"
            }
        }
        try:
            res = await client.post(url, json=payload, timeout=30.0)
            res.raise_for_status()
            data = res.json()
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except httpx.HTTPStatusError as e:
            print(f"[Gemini Error] Status: {e.response.status_code}")
            print(f"[Gemini Error] Response body: {e.response.text}")
            raise

async def run_llm_race(prompt: str) -> str:
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
                result = task.result()
                for p in pending:
                    p.cancel()
                return result
            except Exception as e:
                print(f"[{task.get_name()}] failed: {type(e).__name__} - {str(e)}. Falling back...")
                if not pending:
                    raise Exception("Both LLMs failed. Check your Local LLM server and Gemini API Key.")

    raise Exception("All LLM tasks failed unexpectedly.")

# --- DATE CALCULATOR ---
def calculate_exact_datetime(raw_date_text, raw_time_text, current_time_str):
    now = datetime.strptime(current_time_str, "%Y-%m-%d %H:%M:%S")
    final_date = None
    final_time = None

    if raw_date_text and str(raw_date_text).lower() not in ['null', 'none']:
        dt_str = str(raw_date_text).lower().strip()
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
        elif "yesterday" in dt_str: final_date = (now - timedelta(days=1)).strftime("%Y-%m-%d")
        elif match := re.search(r'in (\d+) day', dt_str):
            days_ahead = int(match.group(1))
            final_date = (now + timedelta(days=days_ahead)).strftime("%Y-%m-%d")
        else:
            days_of_week = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
            for i, day in enumerate(days_of_week):
                if day in dt_str:
                    days_ahead = i - now.weekday()
                    if "last" in dt_str:
                        if days_ahead >= 0: days_ahead -= 7
                    elif days_ahead <= 0 or "next" in dt_str: days_ahead += 7
                    final_date = (now + timedelta(days=days_ahead)).strftime("%Y-%m-%d")
                    break

    if raw_time_text and str(raw_time_text).lower() not in ['null', 'none']:
        tt_str = str(raw_time_text).lower().strip().replace('.', ':')
        if re.match(r'\d{2}:\d{2}:\d{2}', tt_str): final_time = tt_str
        # Vague phrases like "noon", "midnight", "morning", "afternoon", etc.
        # have no single exact clock time, so they're deliberately left
        # unmatched here (final_time stays None) rather than guessed at —
        # the caller treats that as "mentioned a time but couldn't resolve
        # it" and asks the user to state an exact time instead.
        elif match := re.search(r'(\d{1,2})(?::(\d{2}))?\s*(am|pm)?', tt_str):
            h, m, ampm = int(match.group(1)), int(match.group(2) or 0), match.group(3)
            if ampm == 'pm' and h < 12: h += 12
            elif ampm == 'am' and h == 12: h = 0
            final_time = f"{h:02d}:{m:02d}:00"

    return final_date, final_time

class AppointmentExtraction(BaseModel):
    intent: str
    date_preference: Optional[str] = None
    time_preference: Optional[str] = None
    doctor_preference: Optional[str] = None
    general_notes: Optional[str] = None
    # Raw phrases as the user said them (or as the LLM extracted them), kept
    # so callers can tell "user didn't mention a date/time at all" apart from
    # "user mentioned one but it couldn't be parsed into an exact value"
    # (date_preference/time_preference would be None in both cases otherwise).
    raw_date_text: Optional[str] = None
    raw_time_text: Optional[str] = None

async def extract_appointment_details(user_text: str, current_time_str: str):
    prompt = f"""
    Extract appointment date/time details from the user text. 
    USER TEXT: "{user_text}"
    
    CRITICAL INSTRUCTION: Output ONLY raw valid JSON. DO NOT output conversational text. DO NOT output <think> tags.
    Fill in the following JSON structure based on the user text:
    {{
        "intent": "booking", 
        "raw_date_text": "the exact date phrase from the user text, e.g. \'tomorrow\', \'next monday\', \'25/12\', \'2026-12-25\', or null if no date was mentioned", 
        "raw_time_text": "the exact time phrase from the user text, e.g. \'2pm\', \'14:00\', \'9.30am\', or null if no time was mentioned", 
        "doctor_preference": "doctor name/gender preference mentioned by the user, or null", 
        "general_notes": "any other relevant free-text notes from the user, or null"
    }}
    Note: If the user is asking a general question not related to booking an appointment (e.g. "Where is the clinic?", "What are your hours?", "Can I bring my child?"), set intent to "question".
    """
    try:
        raw_text = await run_llm_race(prompt)
        json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        llm_data = json.loads(json_match.group(0)) if json_match else json.loads(raw_text)
        
        raw_date_text = llm_data.get("raw_date_text")
        raw_time_text = llm_data.get("raw_time_text")
        if isinstance(raw_date_text, str) and raw_date_text.lower().strip() in ['null', 'none', '']: raw_date_text = None
        if isinstance(raw_time_text, str) and raw_time_text.lower().strip() in ['null', 'none', '']: raw_time_text = None

        calculated_date, calculated_time = calculate_exact_datetime(raw_date_text, raw_time_text, current_time_str)
        return AppointmentExtraction(
            intent=llm_data.get("intent", "booking"), 
            date_preference=calculated_date, 
            time_preference=calculated_time, 
            doctor_preference=llm_data.get("doctor_preference"), 
            general_notes=llm_data.get("general_notes"),
            raw_date_text=raw_date_text,
            raw_time_text=raw_time_text
        )
    except Exception as e:
        # Fallback if both AIs fail: Just capture the whole text as a general booking note
        return AppointmentExtraction(
            intent="booking",
            date_preference=None,
            time_preference=None,
            doctor_preference=None,
            general_notes=user_text,
            raw_date_text=None,
            raw_time_text=None
        )

async def classify_general_message(user_text: str) -> str:
    """
    Classifies a free-text message sent from the 'General Question' entry point.
    Returns one of: "create", "check", "modify", "delete", "other", "unrelated".
    "other" means the message IS related to the clinic (e.g. a general question
    about hours, location, pricing, services) but not to booking/checking/
    modifying/cancelling an appointment, and should be routed to the clinic admin.
    "unrelated" means the message has NOTHING to do with this medical clinic at
    all (e.g. "I want to book a car service") and should NOT be routed to the
    clinic admin.
    """
    prompt = f"""
    You are classifying a patient's message sent to a MEDICAL CLINIC chatbot.
    This clinic ONLY handles medical/health services: doctor consultations,
    vaccinations, and blood tests. It has nothing to do with any other business
    (cars, food, salons, hotels, etc.).

    USER TEXT: "{user_text}"

    Decide which single category the message belongs to:
    - "create": the patient wants to make/book a NEW medical appointment AT THIS
      CLINIC (e.g. a vaccination, blood test, or doctor consultation).
    - "check": the patient wants to check/view/see their existing medical
      appointment AT THIS CLINIC.
    - "modify": the patient wants to change/reschedule/update an existing medical
      appointment AT THIS CLINIC.
    - "delete": the patient wants to cancel an existing medical appointment AT
      THIS CLINIC.
    - "other": a genuine question or message ABOUT THIS CLINIC that is not about
      booking/checking/modifying/cancelling an appointment (e.g. "What are your
      operating hours?", clinic location, pricing of clinic services, "can I
      bring my child?", greetings directed at the clinic).
    - "unrelated": the message is about booking, buying, checking, modifying,
      cancelling, or asking the price of ANYTHING that is NOT a medical
      appointment at this clinic. This includes bookings/reservations/purchases
      for other businesses or services entirely (e.g. "I want to book a car
      service", "book a hotel room", "price of cake", "check my flight
      booking") - these use booking-like words but are NOT about this clinic.

    IMPORTANT: The mere presence of words like "book", "appointment", "check",
    "cancel", or "price" does NOT automatically mean "create"/"check"/"modify"/
    "delete"/"other" - only use those categories if the request is clearly about
    a MEDICAL appointment AT THIS CLINIC. A question clearly about this clinic's
    own operations (e.g. "What are your operating hours?") is always "other",
    never "unrelated". If the message is about booking/checking/pricing
    something that is NOT a medical service at this clinic, or you are unsure
    whether it relates to this clinic at all, classify it as "unrelated".

    CRITICAL INSTRUCTION: Output ONLY raw valid JSON. DO NOT output conversational text. DO NOT output <think> tags.
    {{"category": "other"}}
    """
    try:
        raw_text = await run_llm_race(prompt)
        json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        data = json.loads(json_match.group(0)) if json_match else json.loads(raw_text)
        category = str(data.get("category", "other")).lower().strip()
        if category not in ("create", "check", "modify", "delete", "unrelated"):
            category = "other"
        return category
    except Exception as e:
        print(f"Message Classification Error: {e}")
        return "other"

async def generate_vaccine_schedule_ai(search_query: str):
    prompt = f"""
    You are a strict Medical Database JSON API. The user entered: "{search_query}".
    
    1. If it is a generic disease (e.g., "COVID", "Flu", "Hepatitis"): Return status "multiple_options" and a list of 3-5 specific vaccine brand names in "options".
    2. If it is a specific vaccine brand (e.g., "Pfizer", "Twinrix"): Return status "exact_match", and provide its medical type, total doses, booster status, and interval schedules. Also determine:
       - allow_repeat_series: Can the patient start another vaccine series after completing one?
       - repeat_interval_days: If yes, how many days to wait before starting a new one? (Integer or null)
       - restart_if_interrupted: Must the vaccine series restart after a long interruption?
       - interruption_restart_days: How long before restart becomes necessary? (Integer in days or null)
    3. If it is unrecognized or fake: Return status "invalid".
    
    CRITICAL INSTRUCTION: Output ONLY raw valid JSON. DO NOT output conversational text. DO NOT output <think> tags.
    {{
        "status": "exact_match", 
        "options": ["Brand A", "Brand B"], 
        "type": "mRNA", 
        "total_doses": 2, 
        "has_booster": true, 
        "allow_repeat_series": false,
        "repeat_interval_days": null,
        "restart_if_interrupted": true,
        "interruption_restart_days": 365,
        "schedules": [
            {{
                "dose_number": 2, 
                "interval_days": 30
            }}
        ] 
    }}
    """
    try:
        raw_text = await run_llm_race(prompt)
        json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        return json.loads(json_match.group(0)) if json_match else json.loads(raw_text)
    except Exception as e:
        print(f"AI Extraction Error: {e}")
        return {"status": "invalid"}
    
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