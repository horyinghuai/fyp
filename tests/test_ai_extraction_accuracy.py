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

from agent import extract_appointment_details

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


@pytest.mark.asyncio
async def test_ai_extraction_overall_accuracy(record_property):
    total_fields = 0
    correct_fields = 0
    exact_matches = 0

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

    field_accuracy = correct_fields / total_fields
    
    # Pass specific internal metrics to conftest.py
    record_property("custom_total", len(LABELED_DATASET))
    record_property("custom_passed", exact_matches)
    record_property("custom_failed", len(LABELED_DATASET) - exact_matches)

    assert field_accuracy == 1.0
