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
        req_dt = datetime.strptime(state['requested_time'], "%Y-%m-%d %H:%M")
    except ValueError:
        return {"is_valid": False, "reason": "Invalid format.", "suggestions": []}

    # Rule 1: Clinic Hours (9:00 - 17:00)
    if req_dt.hour < 9 or req_dt.hour >= 17:
        return {
            "is_valid": False, 
            "reason": "Clinic is only open 09:00 - 17:00.",
            "suggestions": [req_dt.replace(hour=9, minute=0).strftime("%Y-%m-%d %H:%M")]
        }

    # Rule 2: Weekend Check
    if req_dt.weekday() == 6: # Sunday
        next_mon = (req_dt + timedelta(days=1)).replace(hour=9, minute=0)
        return {"is_valid": False, "reason": "Closed on Sundays.", "suggestions": [next_mon.strftime("%Y-%m-%d %H:%M")]}

    # Rule 3: Simulated "Full Slot" (e.g., specific busy hours)
    if req_dt.hour == 14: # Simulate 2 PM as always full
        sug = (req_dt + timedelta(hours=1)).strftime("%Y-%m-%d %H:%M")
        return {"is_valid": False, "reason": "That slot is currently full.", "suggestions": [sug]}

    return {"is_valid": True, "reason": "Slot available.", "suggestions": []}

workflow = StateGraph(AgentState)
workflow.add_node("check_schedule", scheduling_agent_node)
workflow.set_entry_point("check_schedule")
workflow.add_edge("check_schedule", END)
scheduling_agent = workflow.compile()