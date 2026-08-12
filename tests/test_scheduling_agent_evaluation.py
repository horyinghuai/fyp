"""
SCHEDULING AGENT EVALUATION (part 2)
---------------------------------------
test_scheduling_accuracy.py already evaluates scheduling_agent_node()'s
open-hours/past-date/Sunday rules (agent.py) against a labeled dataset -
that's "Scheduling Agent Evaluation" part 1.

This file is part 2: it evaluates recommend_slots() (main.py) - the
WORKLOAD-BALANCING half of the scheduling agent, i.e. "given several
candidate doctors, does it recommend the least busy one, and does it
honour an explicit doctor preference?"

Uses the same MagicMock chain-mocking pattern as
test_agent3_recommend_slots_workload_balancing in test_agent.py, since
recommend_slots' query chains are too free-form (many joins reused for
different purposes) for the model-keyed FakeSession used in
test_vaccine_dependency_evaluation.py. NOTE: because MagicMock ignores
filter *arguments*, this evaluates the agent's DECISION logic (given
candidates, does it pick correctly?) rather than the SQL filtering
itself - the SQL filtering is exercised for real in
test_booking_success_rate.py's integration tests.

Run just these with:
    pytest -m accuracy test_scheduling_agent_evaluation.py
"""
import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from main import recommend_slots, RecommendSlotReq

pytestmark = pytest.mark.accuracy


def _next_saturday_str():
    today = datetime.now()
    days_ahead = (5 - today.weekday()) % 7  # 5 = Saturday
    days_ahead = days_ahead or 7
    return (today + timedelta(days=days_ahead)).strftime("%Y-%m-%d")


def _make_doctor(ic, name):
    doc = MagicMock()
    doc.ic_passport_number = ic
    doc.name = name
    return doc


def _make_availability():
    avail = MagicMock()
    avail.start_time = datetime.strptime("09:00", "%H:%M").time()
    avail.end_time = datetime.strptime("17:00", "%H:%M").time()
    avail.day_of_week = "sat"
    return avail


@patch("main.logging_agent")
def test_recommends_the_least_busy_doctor(mock_logging):
    """DR. TAN has 2 upcoming appointments, DR. LEE has 0.
    The agent should recommend DR. LEE."""
    mock_db = MagicMock()
    doc_tan = _make_doctor("111", "DR. TAN")
    doc_lee = _make_doctor("222", "DR. LEE")

    mock_db.query.return_value.join.return_value.filter.return_value.distinct.return_value.all.return_value = \
        [doc_tan, doc_lee]
    # future_appts: DR. TAN has 2 upcoming stages, DR. LEE has none
    mock_db.query.return_value.join.return_value.filter.return_value.all.return_value = [
        ("111", datetime.now() + timedelta(days=1)),
        ("111", datetime.now() + timedelta(days=2)),
    ]
    mock_db.query.return_value.join.return_value.filter.return_value.first.return_value = None  # no conflicts
    mock_db.query.return_value.filter.return_value.all.return_value = [_make_availability()]

    req = RecommendSlotReq(
        clinic_id="c1111111-1111-1111-1111-111111111111",
        base_date=_next_saturday_str(),
        doctor_pref="ANY",
        duration=30,
    )
    res = recommend_slots(req, db=mock_db)

    assert res.get("recommended_doctor") == "DR. LEE", \
        f"Expected the less-busy doctor (DR. LEE) to be recommended, got: {res}"


@patch("main.logging_agent")
def test_honours_explicit_doctor_preference(mock_logging):
    """When the candidate pool is already filtered down to one doctor
    (as the SQL WHERE clause would do for a named doctor_pref), the agent
    must recommend exactly that doctor rather than substituting another."""
    mock_db = MagicMock()
    doc_lee = _make_doctor("222", "DR. LEE")

    # FIX: Absorb chained .filter() calls by making filter return itself
    mock_filter = mock_db.query.return_value.join.return_value.filter.return_value
    mock_filter.filter.return_value = mock_filter
    
    mock_filter.distinct.return_value.all.return_value = [doc_lee]
    mock_filter.all.return_value = []
    mock_filter.first.return_value = None
    
    mock_db.query.return_value.filter.return_value.all.return_value = [_make_availability()]

    req = RecommendSlotReq(
        clinic_id="c1111111-1111-1111-1111-111111111111",
        base_date=_next_saturday_str(),
        doctor_pref="DR. LEE",
        duration=30,
    )
    res = recommend_slots(req, db=mock_db)

    assert res.get("recommended_doctor") == "DR. LEE"


@patch("main.logging_agent")
def test_no_matching_doctor_returns_clear_error(mock_logging):
    """If the (pre-filtered) candidate pool is empty, the agent should
    return a clear error rather than crash or silently pick someone."""
    mock_db = MagicMock()
    mock_db.query.return_value.join.return_value.filter.return_value.distinct.return_value.all.return_value = []

    req = RecommendSlotReq(
        clinic_id="c1111111-1111-1111-1111-111111111111",
        base_date=_next_saturday_str(),
        doctor_pref="DR. NOBODY",
        duration=30,
    )
    res = recommend_slots(req, db=mock_db)

    assert "error" in res
