"""
VACCINE DEPENDENCY VALIDATION EVALUATION
-------------------------------------------
test_agent.py has one brand-switch example for validate_vaccine_booking().
This file is the dedicated evaluation suite for it: a labeled dataset that
exercises every distinct clinical rule in validate_vaccine_booking() and
get_next_vaccine_dose() (main.py), each traced against the actual source
so the expected outcome is guaranteed correct, not guessed:

  validate_vaccine_booking():
    A. brand-switch mid-series is rejected
    B. correct-brand continuation within the required interval is accepted
    C. correct-brand continuation BEFORE the required interval is rejected
    D. requesting a completed, non-repeatable series again is rejected
    E. requesting a completed, repeatable series after its interval is accepted
    F. requesting a dose after the interruption-restart window has lapsed
       is rejected and flagged for restart

  get_next_vaccine_dose():
    G. no history -> Dose 1 / Single Dose
    H. partial history, same brand -> correct next dose number
    I. partial history, different brand -> flagged as a brand switch

Uses fake_db.FakeSession (see fake_db.py) instead of MagicMock, because the
functions under test make several queries against different models in an
order that would make MagicMock side_effect lists extremely fragile.

Run just these with:
    pytest -m accuracy test_vaccine_dependency_evaluation.py
"""
import pytest
from types import SimpleNamespace
from datetime import datetime

from tests.fake_db import FakeSession
import models
from main import validate_vaccine_booking, get_next_vaccine_dose, ValidateVaccineDateReq

pytestmark = pytest.mark.accuracy

CLINIC_ID = "c1111111-1111-1111-1111-111111111111"
IC = "900101-14-5533"

def make_vaccine(id, name, type_, total_doses, has_booster=False,
                  allow_repeat_series=False, repeat_interval_days=None,
                  restart_if_interrupted=False, interruption_restart_days=None):
    return SimpleNamespace(
        id=id, name=name, type=type_, total_doses=total_doses, has_booster=has_booster,
        allow_repeat_series=allow_repeat_series, repeat_interval_days=repeat_interval_days,
        restart_if_interrupted=restart_if_interrupted, interruption_restart_days=interruption_restart_days,
    )


def make_schedule(dose_number, interval_days):
    return SimpleNamespace(dose_number=dose_number, interval_days=interval_days)


# =====================================================================
# validate_vaccine_booking() scenarios
# =====================================================================

def test_brand_switch_mid_series_rejected():
    brand_b = make_vaccine(2, "Brand B", "Hepatitis B", total_doses=3)
    brand_a = make_vaccine(1, "Brand A", "Hepatitis B", total_doses=3)
    db = FakeSession({
        models.Vaccine: [brand_b, brand_a],   # rows[0] must be the requested vaccine
        models.Patient: [("patient-1",)],
        models.ApptStage: [("Dose 1", datetime(2026, 1, 1), "completed", 1, "s1")],
    })
    req = ValidateVaccineDateReq(clinic_id=CLINIC_ID, ic=IC, vaccine_name="Brand B",
                                  target_dose="Dose 2", requested_time="2026-08-01 10:00:00")
    res = validate_vaccine_booking(req, db=db)
    assert res["is_valid"] is False
    assert "Brand A" in res["reason"]


def test_same_brand_interval_satisfied_accepted():
    brand_a = make_vaccine(1, "Brand A", "Hepatitis B", total_doses=2)
    db = FakeSession({
        models.Vaccine: [brand_a],
        models.Patient: [("patient-1",)],
        models.ApptStage: [("Dose 1", datetime(2026, 1, 1), "completed", 1, "s1")],
        models.VaccineDoseSchedule: [make_schedule(2, 30)],
    })
    req = ValidateVaccineDateReq(clinic_id=CLINIC_ID, ic=IC, vaccine_name="Brand A",
                                  target_dose="Dose 2", requested_time="2026-02-15 10:00:00")  # 45 days later
    res = validate_vaccine_booking(req, db=db)
    assert res["is_valid"] is True
    assert res["target_dose"] == "Dose 2"


def test_same_brand_interval_too_early_rejected():
    brand_a = make_vaccine(1, "Brand A", "Hepatitis B", total_doses=2)
    db = FakeSession({
        models.Vaccine: [brand_a],
        models.Patient: [("patient-1",)],
        models.ApptStage: [("Dose 1", datetime(2026, 1, 1), "completed", 1, "s1")],
        models.VaccineDoseSchedule: [make_schedule(2, 30)],
    })
    req = ValidateVaccineDateReq(clinic_id=CLINIC_ID, ic=IC, vaccine_name="Brand A",
                                  target_dose="Dose 2", requested_time="2026-01-10 10:00:00")  # 9 days later
    res = validate_vaccine_booking(req, db=db)
    assert res["is_valid"] is False
    assert "2026-01-31" in res["reason"]  # earliest allowed date, per the 30-day rule


def test_completed_non_repeatable_series_rejected():
    brand_a = make_vaccine(1, "Brand A", "Flu", total_doses=1, allow_repeat_series=False)
    db = FakeSession({
        models.Vaccine: [brand_a],
        models.Patient: [("patient-1",)],
        models.ApptStage: [("Single Dose", datetime(2025, 1, 1), "completed", 1, "s1")],
    })
    req = ValidateVaccineDateReq(clinic_id=CLINIC_ID, ic=IC, vaccine_name="Brand A",
                                  target_dose="Single Dose", requested_time="2026-08-01 10:00:00")
    res = validate_vaccine_booking(req, db=db)
    assert res["is_valid"] is False
    assert "cannot be repeated" in res["reason"]


def test_completed_repeatable_series_after_interval_accepted():
    brand_a = make_vaccine(1, "Brand A", "Flu", total_doses=1,
                            allow_repeat_series=True, repeat_interval_days=365)
    db = FakeSession({
        models.Vaccine: [brand_a],
        models.Patient: [("patient-1",)],
        models.ApptStage: [("Single Dose", datetime(2025, 1, 1), "completed", 1, "s1")],
    })
    req = ValidateVaccineDateReq(clinic_id=CLINIC_ID, ic=IC, vaccine_name="Brand A",
                                  target_dose="Single Dose", requested_time="2026-06-01 10:00:00")  # >365 days
    res = validate_vaccine_booking(req, db=db)
    assert res["is_valid"] is True


def test_interruption_window_expired_flags_restart():
    brand_a = make_vaccine(1, "Brand A", "Hepatitis B", total_doses=3,
                            restart_if_interrupted=True, interruption_restart_days=180)
    db = FakeSession({
        models.Vaccine: [brand_a],
        models.Patient: [("patient-1",)],
        models.ApptStage: [("Dose 1", datetime(2025, 1, 1), "completed", 1, "s1")],
    })
    req = ValidateVaccineDateReq(clinic_id=CLINIC_ID, ic=IC, vaccine_name="Brand A",
                                  target_dose="Dose 2", requested_time="2026-01-01 10:00:00")  # ~365 days later
    res = validate_vaccine_booking(req, db=db)
    assert res["is_valid"] is False
    assert "expired" in res["reason"].lower()
    assert "restart" in res["reason"].lower()


# =====================================================================
# get_next_vaccine_dose() scenarios
# =====================================================================

def test_no_history_returns_dose_one():
    brand_a = make_vaccine(1, "Brand A", "Hepatitis B", total_doses=3)
    db = FakeSession({models.Vaccine: [brand_a]})
    res = get_next_vaccine_dose(ic=IC, vaccine_name="Brand A", clinic_id=None, db=db)
    assert res["next_dose"] == "Dose 1"
    assert res["no_history"] is True


def test_partial_history_same_brand_returns_correct_next_dose():
    brand_a = make_vaccine(1, "Brand A", "Hepatitis B", total_doses=3)
    db = FakeSession({
        models.Vaccine: [brand_a],
        # get_next_vaccine_dose selects (stage_name, status, scheduled_time, vaccine_id)
        models.ApptStage: [("Dose 1", "completed", datetime(2026, 1, 1), 1)],
    })
    res = get_next_vaccine_dose(ic=IC, vaccine_name="Brand A", clinic_id=None, db=db)
    assert res["next_dose"] == "Dose 2"
    assert res["is_brand_switch"] is False


def test_partial_history_different_brand_flags_switch():
    brand_b = make_vaccine(2, "Brand B", "Hepatitis B", total_doses=3)
    brand_a = make_vaccine(1, "Brand A", "Hepatitis B", total_doses=3)
    db = FakeSession({
        models.Vaccine: [brand_b, brand_a],
        models.ApptStage: [("Dose 1", "completed", datetime(2026, 1, 1), 1)],  # brand A's id
    })
    res = get_next_vaccine_dose(ic=IC, vaccine_name="Brand B", clinic_id=None, db=db)
    assert res["is_brand_switch"] is True
    assert res["active_brand"] == "Brand A"


# =====================================================================
# Overall accuracy score for the FYP report
# =====================================================================

ALL_SCENARIOS = [
    test_brand_switch_mid_series_rejected,
    test_same_brand_interval_satisfied_accepted,
    test_same_brand_interval_too_early_rejected,
    test_completed_non_repeatable_series_rejected,
    test_completed_repeatable_series_after_interval_accepted,
    test_interruption_window_expired_flags_restart,
    test_no_history_returns_dose_one,
    test_partial_history_same_brand_returns_correct_next_dose,
    test_partial_history_different_brand_flags_switch,
]


def test_vaccine_dependency_validation_overall_accuracy(record_property):
    correct = 0
    for scenario in ALL_SCENARIOS:
        try:
            scenario()
            correct += 1
        except AssertionError:
            pass
            
    # Pass specific internal metrics to conftest.py
    record_property("custom_total", len(ALL_SCENARIOS))
    record_property("custom_passed", correct)
    record_property("custom_failed", len(ALL_SCENARIOS) - correct)
    
    accuracy = correct / len(ALL_SCENARIOS)
    assert accuracy == 1.0
