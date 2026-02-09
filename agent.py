from typing import TypedDict
from langgraph.graph import StateGraph, END

class AgentState(TypedDict):
    appt_type: str
    requested_time: str
    prev_stage_status: str # Added for multi-stage checks
    is_valid: bool
    reason: str

def heuristic_check_node(state: AgentState):
    # Rule 1: Conflict Avoidance
    if "23:00" in state['requested_time']: 
        return {"is_valid": False, "reason": "Clinic is closed during night hours."}
    
    # Rule 2: Multi-stage dependency
    if "Dose 2" in state['appt_type'] and state['prev_stage_status'] != 'completed':
        return {"is_valid": False, "reason": "Dose 1 must be completed first."}

    return {"is_valid": True, "reason": "Slot available and rules met."}

workflow = StateGraph(AgentState)
workflow.add_node("validate", heuristic_check_node)
workflow.set_entry_point("validate")
workflow.add_edge("validate", END)

scheduling_agent = workflow.compile()