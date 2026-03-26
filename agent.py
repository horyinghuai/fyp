from typing import TypedDict, List
from langgraph.graph import StateGraph, END
from datetime import datetime, timedelta

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

    # Rule 0: Prevent Past Bookings
    if req_dt < now:
        return {
            "is_valid": False, 
            "reason": "You cannot book an appointment in the past.",
            "suggestions": [] # You can optionally generate futuristic suggestions here
        }

    # Rule 1: Clinic Hours (9:00 - 17:00)
    if req_dt.hour < 9 or req_dt.hour > 17 or (req_dt.hour == 17 and req_dt.minute > 0):
        return {
            "is_valid": False, 
            "reason": "Clinic is only open 09:00 - 17:00.",
            "suggestions": [req_dt.replace(hour=9, minute=0, second=0).strftime("%Y-%m-%d %H:%M:%S")]
        }

    # Rule 2: Weekend Check
    if req_dt.weekday() == 6: # Sunday
        next_mon = (req_dt + timedelta(days=1)).replace(hour=9, minute=0, second=0)
        return {"is_valid": False, "reason": "Closed on Sundays.", "suggestions": [next_mon.strftime("%Y-%m-%d %H:%M:%S")]}

    return {"is_valid": True, "reason": "Slot available.", "suggestions": []}

workflow = StateGraph(AgentState)
workflow.add_node("check_schedule", scheduling_agent_node)
workflow.set_entry_point("check_schedule")
workflow.add_edge("check_schedule", END)
scheduling_agent = workflow.compile()