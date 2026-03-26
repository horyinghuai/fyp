import os
from typing import TypedDict, List, Optional
from langgraph.graph import StateGraph, END
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

# --- AI Extraction Logic ---
class AppointmentExtraction(BaseModel):
    intent: str = Field(description="Must be either 'booking' or 'reschedule'")
    date_preference: Optional[str] = Field(description="Extracted date in strictly YYYY-MM-DD format, or null if missing.")
    time_preference: Optional[str] = Field(description="Extracted time in strictly HH:MM:SS format (24-hour), or null if missing.")
    doctor_preference: Optional[str] = Field(description="Name of the preferred doctor, or null if missing.")

def extract_appointment_details(user_text: str, current_time_str: str):
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return {"error": "Missing GOOGLE_API_KEY. AI extraction disabled."}
        
    # Use Gemini 1.5 Flash instead of OpenAI
    llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0, google_api_key=api_key)
    structured_llm = llm.with_structured_output(AppointmentExtraction)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an AI Clinic Assistant extracting data. The current date and time is {current_time}. "
                   "If the user uses relative terms like 'tomorrow' or 'next monday', calculate the exact YYYY-MM-DD date. "
                   "Convert times like '5pm' into 17:00:00."),
        ("human", "{user_text}")
    ])
    
    chain = prompt | structured_llm
    return chain.invoke({"user_text": user_text, "current_time": current_time_str})

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