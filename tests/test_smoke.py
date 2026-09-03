"""
SMOKE TESTS
-----------
Fast, shallow checks that answer: "is the system even alive?"
These should run in well under a second total and catch things like
broken imports, missing routes, or a completely broken agent graph —
before you bother running the slower suites.

Run just these with:
    pytest -m smoke
"""
import pytest
from datetime import datetime, timedelta

pytestmark = pytest.mark.smoke


def test_main_app_imports_and_boots():
    import main
    assert main.app is not None
    assert main.app.title == "Clinic Smart Assistant Backend"


def test_agent_module_imports():
    import agent
    assert agent.scheduling_agent is not None
    assert callable(agent.classify_general_message)  # Message-Intent Classification (Agent 1)


def test_celery_worker_imports():
    import celery_worker
    assert celery_worker.celery_app is not None


def test_key_routes_are_registered():
    """Catches the classic 'refactored a route path and forgot the frontend' bug."""
    import main
    paths = {r.path for r in main.app.routes}
    expected = [
        "/book-appointment",
        "/update-appointment",
        "/cancel-appointment/{appt_id}",
        "/recommend-slots",
        "/validate-vaccine-booking",
        "/ai-extract",
        "/classify-message",
        "/available-dates",
        "/available-times",
        # Patient-Admin Communication Agent (bi-directional relay)
        "/ask-admin",
        "/admin/chat-reply",
        "/admin/chat-reply/{msg_id}",
        "/admin/chat-pending-count/{clinic_id}",
        "/admin/chat-history/{clinic_id}",
    ]
    for path in expected:
        assert path in paths, f"Route {path} is missing from main.app"


def test_communication_agent_functions_importable():
    """Catches a broken import in the Patient-Admin Communication Agent's
    relay endpoints before the slower suites run."""
    from main import ask_admin, reply_chat, edit_chat_reply, delete_chat_reply, get_pending_chat_count
    assert callable(ask_admin)
    assert callable(reply_chat)
    assert callable(edit_chat_reply)
    assert callable(delete_chat_reply)
    assert callable(get_pending_chat_count)


def test_scheduling_agent_node_responds():
    from agent import scheduling_agent_node
    future = (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d 10:00:00")
    res = scheduling_agent_node({"requested_time": future})
    assert "is_valid" in res and "reason" in res


def test_appointment_extraction_model_shape():
    from agent import AppointmentExtraction
    obj = AppointmentExtraction(intent="booking")
    assert obj.date_preference is None
    assert obj.intent == "booking"