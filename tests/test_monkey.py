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
import pytest
from datetime import datetime, timedelta
from hypothesis import given, settings, strategies as st, HealthCheck

from agent import calculate_exact_datetime, scheduling_agent_node

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
