from typing import TypedDict, Annotated, List
from langgraph.graph import StateGraph, END

class AgentState(TypedDict):
    patient_id: str
    requested_time: str
    stage_name: str
    is_valid: bool
    reason: str

def heuristic_check_node(state: AgentState):
    # logic for "load balancing" and "conflict avoidance"
    # Example: Check if doctor is available at requested_time
    if "09:00" in state['requested_time']: # Simplified logic
        return {"is_valid": True, "reason": "Slot available"}
    return {"is_valid": False, "reason": "Time slot fully booked"}

# Build the Graph
workflow = StateGraph(AgentState)
workflow.add_node("validate", heuristic_check_node)
workflow.set_entry_point("validate")
workflow.add_edge("validate", END)

scheduling_agent = workflow.compile()