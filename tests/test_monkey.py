"""
MONKEY TESTING (randomized / fuzz input)
-----------------------------------------
Throws large volumes of random / malformed / edge-case input at the parts
of your system that touch user-supplied or LLM-supplied text, to catch
crashes that hand-written example-based tests (test_agent.py) wouldn't
think to try.

Needs: pip install hypothesis

Run just these with:
    pytest -m monkey
"""
import json
import asyncio
import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch
from hypothesis import given, settings, strategies as st, HealthCheck

from agent import calculate_exact_datetime, scheduling_agent_node, classify_general_message

pytestmark = pytest.mark.monkey


@settings(max_examples=200, suppress_health_check=[HealthCheck.too_slow])
@given(
    raw_date=st.one_of(st.none(), st.text(max_size=40)),
    raw_time=st.one_of(st.none(), st.text(max_size=40)),
)
def test_calculate_exact_datetime_never_crashes_on_garbage(raw_date, raw_time):
    """calculate_exact_datetime is fed whatever the LLM decides 'raw_date_text'
    and 'raw_time_text' are. It must degrade gracefully (return None), never
    raise, no matter how malformed the string is."""
    date_out, time_out = calculate_exact_datetime(raw_date, raw_time, "2026-07-25 13:00:00")
    assert date_out is None or isinstance(date_out, str)
    assert time_out is None or isinstance(time_out, str)


@settings(max_examples=200, suppress_health_check=[HealthCheck.too_slow])
@given(garbage=st.text(max_size=60))
def test_scheduling_agent_node_handles_arbitrary_strings(garbage):
    """requested_time should only ever come from a well-formed upstream call,
    but this proves a malformed/injected value fails safely (is_valid=False)
    instead of raising an unhandled exception that would 500 the API."""
    res = scheduling_agent_node({"requested_time": garbage})
    assert res["is_valid"] is False
    assert isinstance(res["reason"], str) and len(res["reason"]) > 0


@settings(max_examples=150, suppress_health_check=[HealthCheck.too_slow])
@given(
    day_offset=st.integers(min_value=-30, max_value=400),
    hour=st.integers(min_value=0, max_value=23),
    minute=st.integers(min_value=0, max_value=59),
)
def test_scheduling_agent_node_random_valid_format_datetimes(day_offset, hour, minute):
    """Random but well-FORMED datetimes across past/future/weekday/weekend/
    open-hours/closed-hours. Checks the function always returns a decision
    and, when it rejects, always gives a reason."""
    candidate_dt = datetime.now() + timedelta(days=day_offset)
    candidate_dt = candidate_dt.replace(hour=hour, minute=minute, second=0, microsecond=0)
    candidate_str = candidate_dt.strftime("%Y-%m-%d %H:%M:%S")

    res = scheduling_agent_node({"requested_time": candidate_str})

    assert isinstance(res["is_valid"], bool)
    if not res["is_valid"]:
        assert res["reason"]
    # Sundays must always be rejected regardless of hour
    if candidate_dt.weekday() == 6 and candidate_dt > datetime.now():
        assert res["is_valid"] is False


# =====================================================================
# AGENT 1 (message-intent classification) - classify_general_message is
# fed whatever raw JSON (or non-JSON) text the LLM race returns. It must
# always degrade to a known category, never raise, no matter how malformed
# the LLM's "category" field is - a crash here would 500 the /classify-message
# endpoint that both bot.py's routing and Agent 2's hand-off detection rely on.
# =====================================================================

@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow, HealthCheck.function_scoped_fixture])
@given(raw_category=st.one_of(st.none(), st.text(max_size=50), st.integers(), st.booleans()))
def test_classify_general_message_never_crashes_on_garbage_category(raw_category):
    garbage_json = json.dumps({"category": raw_category})

    async def run():
        with patch("agent.run_llm_race", return_value=garbage_json):
            return await classify_general_message("some patient message")

    result = asyncio.run(run())
    assert result in ("create", "check", "modify", "delete", "other", "unrelated")


@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow, HealthCheck.function_scoped_fixture])
@given(garbage_text=st.text(max_size=200))
def test_classify_general_message_never_crashes_on_non_json_llm_output(garbage_text):
    async def run():
        with patch("agent.run_llm_race", return_value=garbage_text):
            return await classify_general_message("Can I book an appointment?")

    result = asyncio.run(run())
    assert result in ("create", "check", "modify", "delete", "other", "unrelated")


# =====================================================================
# AGENT 2 (Patient-Admin Communication Agent) - the admin's free-text reply
# is forwarded verbatim to Telegram. It must never crash the relay, however
# strange the unicode/emoji/control-character content is.
# =====================================================================

class _FakeTelegramAsyncClient:
    def __init__(self, *a, **kw): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *a): return False
    async def post(self, *a, **kw):
        class _Resp:
            status_code = 200
            def json(self_inner): return {"result": {"message_id": 1}}
        return _Resp()


@settings(max_examples=50, suppress_health_check=[HealthCheck.too_slow, HealthCheck.function_scoped_fixture])
@given(garbage_text=st.text(max_size=500))
def test_admin_chat_reply_never_crashes_on_garbage_text(garbage_text):
    import main as main_module

    mock_db = MagicMock()

    async def run():
        with patch("main.httpx.AsyncClient", _FakeTelegramAsyncClient):
            req = main_module.ChatReplyReq(clinic_id="c1111111-1111-1111-1111-111111111111", reply_text=garbage_text, telegram_id=123456789)
            return await main_module.reply_chat(req, db=mock_db)

    res = asyncio.run(run())
    assert res == {"status": "success"}