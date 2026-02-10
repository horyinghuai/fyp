from typing import TypedDict, Optional
from langgraph.graph import StateGraph, END
from datetime import datetime, timedelta

class AgentState(TypedDict):
    appt_type: str
    requested_time: str
    prev_stage_status: str
    prev_stage_time: Optional[str] # Added for gap check
    is_valid: bool
    reason: str

def heuristic_check_node(state: AgentState):
    try:
        req_dt = datetime.strptime(state['requested_time'], "%Y-%m-%d %H:%M")
    except ValueError:
        return {"is_valid": False, "reason": "Invalid date format. Use YYYY-MM-DD HH:MM"}

    # Rule 1: Clinic Hours (09:00 - 17:00)
    if req_dt.hour < 9 or req_dt.hour >= 17:
        return {"is_valid": False, "reason": "Clinic is only open from 09:00 to 17:00."}

    # Rule 2: Weekend Check (Sunday Closed)
    if req_dt.weekday() == 6: # 6 is Sunday
        return {"is_valid": False, "reason": "Clinic is closed on Sundays."}

    # Rule 3: Conflict Avoidance (Simulated Load Balancing)
    # Block lunch hour (13:00 - 14:00)
    if req_dt.hour == 13:
        return {"is_valid": False, "reason": "No slots available during lunch hour (13:00-14:00)."}

    # Rule 4: Multi-stage Vaccination Dependency
    if "Dose 2" in state['appt_type']:
        if state['prev_stage_status'] != 'completed':
            return {"is_valid": False, "reason": "Dose 1 must be completed first."}
        
        if state['prev_stage_time']:
            prev_dt = datetime.strptime(state['prev_stage_time'], "%Y-%m-%d %H:%M")
            # Enforce 21-day gap
            if (req_dt - prev_dt).days < 21:
                return {"is_valid": False, "reason": "Dose 2 must be at least 21 days after Dose 1."}

    return {"is_valid": True, "reason": "Slot available and all clinical rules met."}

workflow = StateGraph(AgentState)
workflow.add_node("validate", heuristic_check_node)
workflow.set_entry_point("validate")
workflow.add_edge("validate", END)

scheduling_agent = workflow.compile()