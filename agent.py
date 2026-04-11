import os
import json
import re
from typing import TypedDict, List, Optional
from langgraph.graph import StateGraph, END
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from openai import OpenAI

# --- LOAD ENV VARIABLES ---
load_dotenv()

# Point to LM Studio's default port (1234)
LOCAL_LLM_BASE_URL = os.getenv('LOCAL_LLM_BASE_URL', 'http://localhost:1234/v1')

# Initialize the Local LLM Client
client = OpenAI(
    base_url=LOCAL_LLM_BASE_URL,
    api_key='lm-studio', # API key is required by the library, but LM studio ignores it
)

# --- 1. PYTHON DETERMINISTIC DATE CALCULATOR ---
def calculate_exact_datetime(raw_date_text: str, raw_time_text: str, current_time_str: str):
    """
    Takes the raw human text extracted by the LLM (e.g. "next monday", "19/4") 
    and uses Python math to convert it perfectly to YYYY-MM-DD and HH:MM:SS.
    """
    now = datetime.strptime(current_time_str, "%Y-%m-%d %H:%M:%S")
    final_date = None
    final_time = None

    # --- DATE CALCULATION ---
    if raw_date_text:
        dt_str = raw_date_text.lower().strip()
        
        # 1. Absolute YYYY-MM-DD
        if re.match(r'\d{4}-\d{2}-\d{2}', dt_str):
            final_date = dt_str
            
        # 2. Format: DD/MM/YYYY or DD/MM/YY or DD/MM (e.g., "19/4", "19/4/26")
        elif match := re.search(r'(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?', dt_str):
            d, m, y = match.groups()
            if not y:
                y = now.year
                # If the month has already passed this year, assume they mean next year
                if int(m) < now.month:
                    y += 1
            elif len(y) == 2:
                y = int(y) + 2000
            final_date = f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
            
        # 3. Relative Days ("today", "tomorrow")
        elif "today" in dt_str:
            final_date = now.strftime("%Y-%m-%d")
        elif "tomorrow" in dt_str:
            final_date = (now + timedelta(days=1)).strftime("%Y-%m-%d")
            
        # 4. "In X days" (e.g., "in 3 days")
        elif match := re.search(r'in (\d+) day', dt_str):
            days_ahead = int(match.group(1))
            final_date = (now + timedelta(days=days_ahead)).strftime("%Y-%m-%d")
            
        # 5. Days of week (e.g., "next monday", "friday")
        else:
            days_of_week = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
            for i, day in enumerate(days_of_week):
                if day in dt_str:
                    current_weekday = now.weekday()
                    target_weekday = i
                    days_ahead = target_weekday - current_weekday
                    
                    # If the day has passed this week, or they explicitly said "next"
                    if days_ahead <= 0 or "next" in dt_str:
                        days_ahead += 7
                        
                    final_date = (now + timedelta(days=days_ahead)).strftime("%Y-%m-%d")
                    break

    # --- TIME CALCULATION ---
    if raw_time_text:
        tt_str = raw_time_text.lower().strip().replace('.', ':') # fixes 5.30pm -> 5:30pm
        
        # 1. Already perfect HH:MM:SS
        if re.match(r'\d{2}:\d{2}:\d{2}', tt_str):
            final_time = tt_str
            
        # 2. Convert 5pm, 5:30pm, 17:00
        elif match := re.search(r'(\d{1,2})(?::(\d{2}))?\s*(am|pm)?', tt_str):
            h = int(match.group(1))
            m = int(match.group(2) or 0)
            ampm = match.group(3)
            
            if ampm == 'pm' and h < 12:
                h += 12
            elif ampm == 'am' and h == 12:
                h = 0
            final_time = f"{h:02d}:{m:02d}:00"

    return final_date, final_time

# --- 2. AI EXTRACTION LOGIC ---

# Model for final output back to main.py
class AppointmentExtraction(BaseModel):
    intent: str
    date_preference: Optional[str]
    time_preference: Optional[str]
    doctor_preference: Optional[str]
    reason: Optional[str]

def extract_appointment_details(user_text: str, current_time_str: str):
    prompt = f"""
    You are an AI Clinic Assistant. Read the user's text and extract the details.
    
    CRITICAL RULE:
    Do NOT attempt to calculate dates or times. Extract the EXACT words the user wrote.
    For example, if they say "next monday at 5pm", extract "next monday" and "5pm".
    
    User Text: "{user_text}"

    Extract the information into strictly valid JSON format. Return ONLY the JSON object matching this exact structure:
    {{
        "intent": "booking", // Or "status", "reschedule", "question"
        "raw_date_text": "extracted exact date words or null",
        "raw_time_text": "extracted exact time words or null",
        "doctor_preference": "Dr. Name or null",
        "reason": "Extracted reason or null"
    }}
    """

    try:
        # Call LM Studio
        response = client.chat.completions.create(
            model="local-model", 
            messages=[
                {"role": "system", "content": "You are a precise data extraction assistant. Extract exact words without altering them. Output strictly valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.0 # Zero randomness for exact extraction
        )
        
        # Parse the JSON response securely (ignoring <think> tags from DeepSeek R1)
        raw_text = response.choices[0].message.content.strip()
        json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        
        if json_match:
            llm_data = json.loads(json_match.group(0))
        else:
            llm_data = json.loads(raw_text)
            
        # --- Python Math Intervention ---
        # Pass the LLM's extracted raw words to our Python calculator
        calculated_date, calculated_time = calculate_exact_datetime(
            raw_date_text=llm_data.get("raw_date_text"),
            raw_time_text=llm_data.get("raw_time_text"),
            current_time_str=current_time_str
        )
        
        # Format the final payload perfectly for main.py
        final_data = AppointmentExtraction(
            intent=llm_data.get("intent", "booking"),
            date_preference=calculated_date,
            time_preference=calculated_time,
            doctor_preference=llm_data.get("doctor_preference"),
            reason=llm_data.get("reason")
        )
        
        return final_data

    except Exception as e:
        return {"error": f"LM Studio Request failed: {str(e)}. Make sure the Local Server is running in LM Studio."}


# --- 3. SCHEDULING AGENT LOGIC (LangGraph) ---
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