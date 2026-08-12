"""
SCHEDULING ACCURACY
----------------------
Feeds a labeled dataset of (requested_time -> expected is_valid, expected
reason keyword) into scheduling_agent_node and reports what percentage of
cases it classifies correctly. This is the "is the scheduling logic
correct" metric for your FYP report, as opposed to test_agent.py which
only checks a couple of individual cases.

Run just these with:
    pytest -m accuracy test_scheduling_accuracy.py
"""
import pytest
from datetime import datetime, timedelta

from agent import scheduling_agent_node

pytestmark = pytest.mark.accuracy


def _future_weekday(days_ahead: int, weekday_target: int, hour: int, minute: int = 0):
    """Helper: returns a datetime `days_ahead`-ish in the future that lands
    on the given weekday (0=Mon ... 6=Sun), at the given hour."""
    base = datetime.now() + timedelta(days=days_ahead)
    delta = (weekday_target - base.weekday()) % 7
    target = base + timedelta(days=delta)
    return target.replace(hour=hour, minute=minute, second=0, microsecond=0)


def build_labeled_dataset():
    """Each row: (requested_time_str, expected_is_valid, expected_reason_substring_or_None)."""
    past = (datetime.now() - timedelta(days=5)).strftime("%Y-%m-%d %H:%M:%S")
    weekday_valid = _future_weekday(14, 2, 10).strftime("%Y-%m-%d %H:%M:%S")       # Wed, 10am
    weekday_too_early = _future_weekday(14, 2, 7).strftime("%Y-%m-%d %H:%M:%S")     # Wed, 7am
    weekday_too_late = _future_weekday(14, 2, 18).strftime("%Y-%m-%d %H:%M:%S")     # Wed, 6pm
    sunday = _future_weekday(14, 6, 10).strftime("%Y-%m-%d %H:%M:%S")               # Sun, 10am
    boundary_open = _future_weekday(14, 2, 9, 0).strftime("%Y-%m-%d %H:%M:%S")      # exactly 09:00
    boundary_close = _future_weekday(14, 2, 17, 0).strftime("%Y-%m-%d %H:%M:%S")    # exactly 17:00

    return [
        (weekday_valid,     True,  None),
        (past,              False, "past"),
        (weekday_too_early, False, "open"),
        (weekday_too_late,  False, "open"),
        (sunday,            False, "sunday"),
        (boundary_open,     True,  None),
        (boundary_close,    True,  None),
        ("not-a-date",      False, "format"),
    ]


@pytest.mark.parametrize("requested_time,expected_valid,expected_reason", build_labeled_dataset())
def test_scheduling_agent_node_individual_case(requested_time, expected_valid, expected_reason):
    res = scheduling_agent_node({"requested_time": requested_time})
    assert res["is_valid"] is expected_valid
    if expected_reason:
        assert expected_reason.lower() in res["reason"].lower()


def test_scheduling_accuracy_overall_score(record_property):
    dataset = build_labeled_dataset()
    correct = 0
    for requested_time, expected_valid, _ in dataset:
        res = scheduling_agent_node({"requested_time": requested_time})
        if res["is_valid"] == expected_valid:
            correct += 1

    accuracy = correct / len(dataset)
    
    # Pass specific internal metrics to conftest.py
    record_property("custom_total", len(dataset))
    record_property("custom_passed", correct)
    record_property("custom_failed", len(dataset) - correct)
    
    assert accuracy == 1.0, "scheduling_agent_node misclassified at least one labeled case"
