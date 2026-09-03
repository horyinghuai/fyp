"""
AI EXTRACTION ACCURACY
--------------------------
Feeds a labeled dataset of (user message -> mocked LLM JSON reply ->
expected parsed AppointmentExtraction fields) through
agent.extract_appointment_details and reports field-level and overall
exact-match accuracy.

We mock run_llm_race rather than calling a live LLM so this test is
deterministic and free to run in CI. If you also want to measure accuracy
of the LLM itself (not just the parsing/date-calculation layer around it),
duplicate this file, remove the mock, and point LOCAL_LLM_BASE_URL /
GEMINI_API_KEY at a live model - that becomes an evaluation script rather
than a CI test since LLM output isn't deterministic run-to-run.

Run just these with:
    pytest -m accuracy test_ai_extraction_accuracy.py
"""
import json
import pytest
from unittest.mock import patch

from agent import extract_appointment_details, classify_general_message

pytestmark = pytest.mark.accuracy

NOW = "2026-07-25 08:00:00"  # Saturday, fixed reference "now" for deterministic date math

# Each row: (user_text, mocked_llm_json, expected_fields)
LABELED_DATASET = [
    (
        "Book Dr. Tan tomorrow at 10am for fever",
        {
            "intent": "booking", "raw_date_text": "tomorrow", "raw_time_text": "10am",
            "doctor_preference": "DR. TAN", "general_notes": "Fever check",
        },
        {
            "intent": "booking", "date_preference": "2026-07-26",
            "time_preference": "10:00:00", "doctor_preference": "DR. TAN",
        },
    ),
    (
        "What are your opening hours?",
        {
            "intent": "question", "raw_date_text": "null", "raw_time_text": "null",
            "doctor_preference": "null", "general_notes": "What are your opening hours?",
        },
        {"intent": "question", "date_preference": None, "time_preference": None},
    ),
    (
        "I need an appointment in 3 days at 2:30pm",
        {
            "intent": "booking", "raw_date_text": "in 3 days", "raw_time_text": "2:30pm",
            "doctor_preference": "null", "general_notes": "null",
        },
        {"intent": "booking", "date_preference": "2026-07-28", "time_preference": "14:30:00"},
    ),
    (
        "Can I bring my child along?",
        {
            "intent": "question", "raw_date_text": "null", "raw_time_text": "null",
            "doctor_preference": "null", "general_notes": "Can I bring my child along?",
        },
        {"intent": "question", "date_preference": None},
    ),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("user_text,mocked_llm_json,expected_fields", LABELED_DATASET)
async def test_ai_extraction_individual_case(user_text, mocked_llm_json, expected_fields):
    with patch("agent.run_llm_race", return_value=json.dumps(mocked_llm_json)):
        result = await extract_appointment_details(user_text, NOW)

    for field, expected_value in expected_fields.items():
        assert getattr(result, field) == expected_value, (
            f"Field '{field}' mismatch for input {user_text!r}: "
            f"got {getattr(result, field)!r}, expected {expected_value!r}"
        )


# =====================================================================
# Message-Intent Classification (classify_general_message)
# ---------------------------------------------------------------------
# The AI Intent Extraction Agent's second job: routing "General Question"
# entry-point text into create/check/modify/delete/other/unrelated so
# bot.py (and Agent 2's off-topic hand-off detection) can route correctly.
# Each row: (user_text, mocked_llm_category, expected_category)
# =====================================================================
CLASSIFY_DATASET = [
    ("I want to book a flu vaccine next week", "create", "create"),
    ("Can you check my appointment for tomorrow?", "check", "check"),
    ("I need to reschedule my Friday appointment", "modify", "modify"),
    ("Please cancel my appointment", "delete", "delete"),
    ("What are your operating hours?", "other", "other"),
    ("Can I bring my child along?", "other", "other"),
    ("I want to book a car service", "unrelated", "unrelated"),
    ("What's the price of a cake?", "unrelated", "unrelated"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("user_text,mocked_category,expected_category", CLASSIFY_DATASET)
async def test_message_classification_individual_case(user_text, mocked_category, expected_category):
    with patch("agent.run_llm_race", return_value=json.dumps({"category": mocked_category})):
        result = await classify_general_message(user_text)
    assert result == expected_category, (
        f"classify_general_message mismatch for {user_text!r}: "
        f"got {result!r}, expected {expected_category!r}"
    )


@pytest.mark.asyncio
async def test_message_classification_falls_back_to_other_on_llm_failure():
    """Agent 2 (the Patient-Admin Communication Agent) relies on this
    classifier's output to decide whether to hand a conversation off to the
    clinic admin. If both LLMs fail, it must fail safe to "other" rather
    than raising and breaking the hand-off flow."""
    with patch("agent.run_llm_race", side_effect=Exception("LLM Timeout")):
        result = await classify_general_message("Some message")
    assert result == "other"


@pytest.mark.asyncio
async def test_message_classification_falls_back_to_other_on_invalid_category():
    """An out-of-set category from the LLM must normalize to "other" rather
    than propagating a value bot.py's routing doesn't know how to handle."""
    with patch("agent.run_llm_race", return_value=json.dumps({"category": "banana"})):
        result = await classify_general_message("Some message")
    assert result == "other"


@pytest.mark.asyncio
async def test_ai_extraction_overall_accuracy(record_property):
    """Combined field-level accuracy for BOTH of Agent 1's jobs: structured
    date/time/doctor extraction (extract_appointment_details) AND message-intent
    classification (classify_general_message)."""
    total_fields = 0
    correct_fields = 0
    exact_matches = 0
    total_cases = len(LABELED_DATASET) + len(CLASSIFY_DATASET)

    for user_text, mocked_llm_json, expected_fields in LABELED_DATASET:
        with patch("agent.run_llm_race", return_value=json.dumps(mocked_llm_json)):
            result = await extract_appointment_details(user_text, NOW)

        row_correct = True
        for field, expected_value in expected_fields.items():
            total_fields += 1
            if getattr(result, field) == expected_value:
                correct_fields += 1
            else:
                row_correct = False
        if row_correct:
            exact_matches += 1

    for user_text, mocked_category, expected_category in CLASSIFY_DATASET:
        with patch("agent.run_llm_race", return_value=json.dumps({"category": mocked_category})):
            result = await classify_general_message(user_text)
        total_fields += 1
        if result == expected_category:
            correct_fields += 1
            exact_matches += 1

    field_accuracy = correct_fields / total_fields

    # Pass specific internal metrics to conftest.py
    record_property("custom_total", total_cases)
    record_property("custom_passed", exact_matches)
    record_property("custom_failed", total_cases - exact_matches)

    assert field_accuracy == 1.0