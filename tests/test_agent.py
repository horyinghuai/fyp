import pytest
import json
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta

# Imports from your project files
from agent import (
    calculate_exact_datetime,
    extract_appointment_details,
    generate_vaccine_schedule_ai,
    scheduling_agent_node,
    classify_general_message,
    AppointmentExtraction
)
from main import (
    recommend_slots,
    validate_vaccine_booking,
    get_next_vaccine_dose,
    ask_admin,
    reply_chat,
    ValidateVaccineDateReq,
    RecommendSlotReq,
    ChatMessageModel,
    ChatReplyReq
)
from celery_worker import run_reminder_agent

# =====================================================================
# AGENT 1: NATURAL LANGUAGE / INTENT EXTRACTION AGENT (agent.py)
# =====================================================================

def test_datetime_calculator_relative_parsing():
    current_time = "2026-07-25 13:00:00"
    date_out, time_out = calculate_exact_datetime("tomorrow", "3pm", current_time)
    assert date_out == "2026-07-26"
    assert time_out == "15:00:00"

def test_datetime_calculator_in_days_parsing():
    current_time = "2026-07-25 13:00:00"
    date_out, time_out = calculate_exact_datetime("in 3 days", "10:30am", current_time)
    assert date_out == "2026-07-28"
    assert time_out == "10:30:00"

def test_datetime_calculator_null_handling():
    current_time = "2026-07-25 13:00:00"
    date_out, time_out = calculate_exact_datetime("null", "none", current_time)
    assert date_out is None
    assert time_out is None

@pytest.mark.asyncio
@patch("agent.run_llm_race")
async def test_agent1_intent_extraction_full_booking(mock_run_llm_race):
    mock_json = json.dumps({
        "intent": "booking",
        "raw_date_text": "tomorrow",
        "raw_time_text": "10am",
        "doctor_preference": "DR. TAN",
        "general_notes": "Fever check"
    })
    mock_run_llm_race.return_value = mock_json

    result = await extract_appointment_details("Book Dr. Tan tomorrow at 10am for fever", "2026-07-25 08:00:00")
    assert isinstance(result, AppointmentExtraction)
    assert result.intent == "booking"
    assert result.date_preference == "2026-07-26"
    assert result.time_preference == "10:00:00"
    assert result.doctor_preference == "DR. TAN"

@pytest.mark.asyncio
@patch("agent.run_llm_race")
async def test_agent1_intent_extraction_question(mock_run_llm_race):
    mock_json = json.dumps({
        "intent": "question",
        "raw_date_text": "null",
        "raw_time_text": "null",
        "doctor_preference": "null",
        "general_notes": "What are your opening hours?"
    })
    mock_run_llm_race.return_value = mock_json

    result = await extract_appointment_details("What are your opening hours?", "2026-07-25 08:00:00")
    assert result.intent == "question"
    assert result.date_preference is None

@pytest.mark.asyncio
@patch("agent.run_llm_race")
async def test_agent1_intent_extraction_fallback(mock_run_llm_race):
    mock_run_llm_race.side_effect = Exception("LLM Timeout")
    user_text = "I need to see a doctor"
    result = await extract_appointment_details(user_text, "2026-07-25 08:00:00")
    assert result.intent == "booking"
    assert result.general_notes == user_text


# --- Message-Intent Classification (classify_general_message) ---
# Feeds the "General Question" entry point's classifier so callers (bot.py's
# routing, and Agent 2's off-topic hand-off detection) get one of the 6
# defined categories every time.

@pytest.mark.asyncio
@patch("agent.run_llm_race")
async def test_agent1_classify_message_booking_category(mock_run_llm_race):
    mock_run_llm_race.return_value = json.dumps({"category": "create"})
    result = await classify_general_message("I'd like to book a flu jab next week")
    assert result == "create"

@pytest.mark.asyncio
@patch("agent.run_llm_race")
async def test_agent1_classify_message_other_category(mock_run_llm_race):
    mock_run_llm_race.return_value = json.dumps({"category": "other"})
    result = await classify_general_message("What are your operating hours?")
    assert result == "other"

@pytest.mark.asyncio
@patch("agent.run_llm_race")
async def test_agent1_classify_message_unrelated_category(mock_run_llm_race):
    mock_run_llm_race.return_value = json.dumps({"category": "unrelated"})
    result = await classify_general_message("I want to book a car service")
    assert result == "unrelated"

@pytest.mark.asyncio
@patch("agent.run_llm_race")
async def test_agent1_classify_message_invalid_category_falls_back_to_other(mock_run_llm_race):
    mock_run_llm_race.return_value = json.dumps({"category": "banana"})
    result = await classify_general_message("Some message")
    assert result == "other"

@pytest.mark.asyncio
@patch("agent.run_llm_race")
async def test_agent1_classify_message_fallback_on_llm_failure(mock_run_llm_race):
    mock_run_llm_race.side_effect = Exception("LLM Timeout")
    result = await classify_general_message("Some message")
    assert result == "other"


# =====================================================================
# AGENT 2: VACCINE CLINICAL RULES & DOSE DEPENDENCY AGENT
# =====================================================================

@pytest.mark.asyncio
@patch("agent.run_llm_race")
async def test_agent2_ai_vaccine_schedule_generator(mock_run_llm_race):
    mock_json = json.dumps({
        "status": "exact_match",
        "type": "Hepatitis B",
        "total_doses": 3,
        "has_booster": False,
        "allow_repeat_series": False
    })
    mock_run_llm_race.return_value = mock_json

    result = await generate_vaccine_schedule_ai("Twinrix")
    assert result["status"] == "exact_match"
    assert result["total_doses"] == 3

def test_agent2_brand_switch_restriction():
    mock_db = MagicMock()
    
    req_vac = MagicMock()
    req_vac.id = 2
    req_vac.name = "Brand B"
    req_vac.type = "Hepatitis B"
    req_vac.total_doses = 3 
    
    active_vac = MagicMock()
    active_vac.id = 1
    active_vac.name = "Brand A"
    active_vac.total_doses = 3

    mock_db.query().filter.return_value.first.side_effect = [req_vac, active_vac]
    mock_db.query().filter.return_value.all.return_value = [active_vac, req_vac]
    mock_db.query().select_from().join().join().join().filter().order_by().all.return_value = [
        ("Dose 1", datetime(2026, 1, 1), "completed", 1, "stage_1")
    ]

    req = ValidateVaccineDateReq(
        clinic_id="c1111111-1111-1111-1111-111111111111",
        ic="900101-14-5533",
        vaccine_name="Brand B",
        target_dose="Dose 2",
        requested_time="2026-08-01 10:00:00"
    )

    res = validate_vaccine_booking(req, db=mock_db)
    assert res["is_valid"] is False
    assert "Brand A" in res["reason"]

def test_agent2_get_next_vaccine_dose_no_history():
    mock_db = MagicMock()
    vaccine = MagicMock()
    vaccine.id = 1
    vaccine.name = "Twinrix"
    vaccine.type = "Hepatitis B"
    vaccine.total_doses = 3
    vaccine.has_booster = False

    mock_db.query().filter.return_value.first.return_value = vaccine
    mock_db.query().filter.return_value.all.return_value = [vaccine]
    mock_db.query().select_from().join().join().join().filter().order_by().all.return_value = []

    res = get_next_vaccine_dose(ic="900101-14-5533", vaccine_name="Twinrix", db=mock_db)
    assert res["next_dose"] == "Dose 1"
    assert res["no_history"] is True


# =====================================================================
# AGENT 3: SLOT SCHEDULING & WORKLOAD RECOMMENDATION AGENT
# =====================================================================

def test_agent3_scheduling_node_validation():
    # Test past time validation
    past_state = {"requested_time": "2020-01-01 10:00:00"}
    res = scheduling_agent_node(past_state)
    assert res["is_valid"] is False
    assert "past" in res["reason"].lower()

    # Test future valid slot
    future_date = datetime.now().year + 1
    valid_state = {"requested_time": f"{future_date}-08-10 10:00:00"}
    res = scheduling_agent_node(valid_state)
    assert res["is_valid"] is True

def test_agent3_scheduling_node_sunday_fallback():
    # Find the next Sunday
    today = datetime.now()
    days_ahead = 6 - today.weekday()
    if days_ahead <= 0: days_ahead += 7
    next_sunday = today + timedelta(days=days_ahead)
    
    state = {"requested_time": f"{next_sunday.strftime('%Y-%m-%d')} 10:00:00"}
    res = scheduling_agent_node(state)
    
    assert res["is_valid"] is False
    assert "Sundays" in res["reason"]
    assert len(res["suggestions"]) == 1 # Should suggest Monday

@patch("main.logging_agent")
def test_agent3_recommend_slots_workload_balancing(mock_logging):
    mock_db = MagicMock()
    
    doc1 = MagicMock()
    doc1.ic_passport_number = "111"
    doc1.name = "DR. TAN"
    
    mock_db.query.return_value.join.return_value.filter.return_value.distinct.return_value.all.return_value = [doc1]
    mock_db.query.return_value.join.return_value.filter.return_value.all.return_value = []
    mock_db.query.return_value.join.return_value.filter.return_value.first.return_value = None
    
    avail = MagicMock()
    avail.start_time = datetime.strptime("09:00", "%H:%M").time()
    avail.end_time = datetime.strptime("17:00", "%H:%M").time()
    avail.day_of_week = "sat"
    
    mock_db.query.return_value.filter.return_value.all.return_value = [avail]

    # recommend_slots() gates candidate slots on `t > datetime.now()` using the
    # real wall clock (it isn't injected/mocked), so a hardcoded calendar date
    # eventually lands in the past and every slot gets filtered out. Compute the
    # next Saturday from today instead, so this test stays valid indefinitely
    # and still matches avail.day_of_week == "sat".
    today = datetime.now().date()
    days_until_saturday = (5 - today.weekday()) % 7  # Monday=0 ... Saturday=5
    if days_until_saturday == 0:
        days_until_saturday = 7  # ensure it's strictly in the future, not "today"
    next_saturday = today + timedelta(days=days_until_saturday)

    req = RecommendSlotReq(
        clinic_id="c1111111-1111-1111-1111-111111111111",
        base_date=next_saturday.strftime("%Y-%m-%d"),
        doctor_pref="ANY",
        duration=30
    )
    
    res = recommend_slots(req, db=mock_db)
    assert "recommended_doctor" in res
    assert res["recommended_doctor"] == "DR. TAN"


# =====================================================================
# AGENT 4: AUTOMATED APPOINTMENT REMINDER AGENT (celery_worker.py)
# =====================================================================

@patch("celery_worker.SessionLocal")
@patch("httpx.post")
def test_agent4_reminder_agent_execution(mock_httpx_post, mock_session_local):
    mock_db = MagicMock()
    mock_session_local.return_value = mock_db

    stage = MagicMock()
    stage.id = "stage-123"
    stage.stage_name = "Dose 2"
    stage.scheduled_time = datetime.now() + timedelta(days=1)

    appt = MagicMock()
    appt.id = "appt-123"
    appt.clinic_id = "c1111111-1111-1111-1111-111111111111"
    appt.doctor_ic = "111"

    patient = MagicMock()
    patient.name = "AHMAD BIN ABU"
    patient.telegram_id = 123456789
    patient.phone = "+60123456789"

    mock_db.query().join().join().filter().all.return_value = [(stage, appt, patient)]
    mock_httpx_post.return_value.status_code = 200

    run_reminder_agent()

    assert mock_httpx_post.called
    assert mock_db.commit.called


# =====================================================================
# AGENT 5: PATIENT-ADMIN COMMUNICATION AGENT (main.py)
# =====================================================================
# Off-topic hand-off detection itself is classify_general_message (see the
# Agent 1 tests above) - these tests cover the other half: the bi-directional
# relay that moves messages between the patient (Telegram) and the clinic
# admin dashboard once a hand-off is live.

class _FakeTelegramAsyncClient:
    """Stand-in for httpx.AsyncClient so reply_chat/ask_admin never hit the
    real Telegram API during tests."""
    calls = []

    def __init__(self, *a, **kw): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *a): return False

    async def post(self, url, json=None, **kw):
        _FakeTelegramAsyncClient.calls.append((url, json))
        class _Resp:
            status_code = 200
            def json(self_inner): return {"result": {"message_id": 1}}
        return _Resp()


@pytest.mark.asyncio
async def test_agent5_admin_reply_saved_and_forwarded_to_patient():
    _FakeTelegramAsyncClient.calls = []
    mock_db = MagicMock()
    req = ChatReplyReq(
        clinic_id="c1111111-1111-1111-1111-111111111111",
        reply_text="Your appointment is confirmed.",
        telegram_id=123456789,
    )
    with patch("main.httpx.AsyncClient", _FakeTelegramAsyncClient):
        res = await reply_chat(req, db=mock_db)

    assert res == {"status": "success"}
    assert mock_db.add.called and mock_db.commit.called
    assert len(_FakeTelegramAsyncClient.calls) == 1
    url, payload = _FakeTelegramAsyncClient.calls[0]
    assert "sendMessage" in url
    assert payload["chat_id"] == 123456789


def test_agent5_ask_admin_is_a_notification_noop():
    """/ask-admin must NOT write its own chat_messages row - bot.py's
    log_all_incoming already saved the patient's message via /log-chat, and a
    regression here would double every hand-off message in the dashboard."""
    mock_db = MagicMock()
    msg = ChatMessageModel(
        clinic_id="c1111111-1111-1111-1111-111111111111",
        telegram_id=123456789,
        message="I need help with something else",
    )
    res = ask_admin(msg, db=mock_db)
    assert res == {"status": "success"}
    assert not mock_db.add.called