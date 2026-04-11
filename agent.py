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

# --- AI EXTRACTION LOGIC ---
class AppointmentExtraction(BaseModel):
    intent: str = Field(description="Must be either 'booking' or 'reschedule'")
    date_preference: Optional[str] = Field(description="Extracted date in strictly YYYY-MM-DD format, or null if missing.")
    time_preference: Optional[str] = Field(description="Extracted time in strictly HH:MM:SS format (24-hour), or null if missing.")
    doctor_preference: Optional[str] = Field(description="Name of the preferred doctor, or null if missing.")
    reason: Optional[str] = Field(description="Extracted reason for visit or any free text details, or null.")

def extract_appointment_details(user_text: str, current_time_str: str):
    prompt = f"""
    You are an AI Clinic Assistant extracting data. The current date and time is {current_time_str}. 
    If the user uses relative terms like 'tomorrow' or 'next monday', calculate the exact YYYY-MM-DD date. 
    Convert times like '5pm' into 17:00:00.
    
    User Text: "{user_text}"

    Extract the information into strictly valid JSON format. Return ONLY the JSON object matching this structure:
    {{
        "intent": "booking",
        "date_preference": "YYYY-MM-DD",
        "time_preference": "HH:MM:SS",
        "doctor_preference": "Dr. Name",
        "reason": "Extracted reason"
    }}
    """

    try:
        # Call LM Studio
        response = client.chat.completions.create(
            model="local-model", # LM Studio will automatically use whatever model is currently loaded in the server tab
            messages=[
                {"role": "system", "content": "You are a precise data extraction assistant. Always output strictly valid JSON without any markdown formatting."},
                {"role": "user", "content": prompt}
            ],
            response_format={ "type": "json_object" }, # Forces LM Studio to only output valid JSON
            temperature=0.0 # Zero randomness for exact, deterministic extraction
        )
        
        # Parse the JSON response
        raw_text = response.choices[0].message.content.strip()
        
        # Cleanup: Sometimes local models wrap JSON in markdown block quotes
        json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if json_match:
            parsed_data = json.loads(json_match.group(0))
        else:
            parsed_data = json.loads(raw_text)
            
        # Validate against our strict Pydantic model
        validated_data = AppointmentExtraction(**parsed_data)
        return validated_data

    except Exception as e:
        return {"error": f"LM Studio Request failed: {str(e)}. Make sure the Local Server is running in LM Studio."}


# --- SCHEDULING AGENT LOGIC (LangGraph) ---
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