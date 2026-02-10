from typing import TypedDict
from langgraph.graph import StateGraph, END

class AgentState(TypedDict):
    service: str
    stock_level: int
    is_valid: bool
    reason: str

def stock_agent_node(state: AgentState):
    # Rule: If stock is below threshold (simulated as 5), inform the clinic
    if state['stock_level'] <= 5:
        return {"is_valid": True, "reason": "Stock is low. Booking approved but restocking initiated."}
    
    if state['stock_level'] <= 0:
        return {"is_valid": False, "reason": "Service currently unavailable due to zero stock."}

    return {"is_valid": True, "reason": "Stock sufficient."}

workflow = StateGraph(AgentState)
workflow.add_node("check_stock", stock_agent_node)
workflow.set_entry_point("check_stock")
workflow.add_edge("check_stock", END)
scheduling_agent = workflow.compile()