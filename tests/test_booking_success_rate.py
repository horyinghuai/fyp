"""
BOOKING SUCCESS RATE
----------------------
Runs a batch of realistic /book-appointment attempts (valid patients +
a few intentionally-broken ones) through the REAL endpoint and reports
what percentage return {"status": "success"}. This is an integration
test, not a unit test, because book_appointment does real DB writes
(Appointment, ApptStage, AppointmentVaccine rows) that are too
intertwined to usefully mock line-by-line.

IMPORTANT - before running this file:
  1. Point DATABASE_URL (in your .env, or exported in the shell) at a
     DISPOSABLE test Postgres database, never production. main.py/database.py
     connect to DATABASE_URL the moment they're imported.
       e.g. postgresql://postgres:postgres@localhost:5433/clinic_test
  2. pip install pytest-asyncio httpx  (TestClient needs httpx installed)

Run just these with:
    pytest -m accuracy test_booking_success_rate.py
"""
import uuid
import pytest
from fastapi.testclient import TestClient

import database
import models
import main

pytestmark = pytest.mark.accuracy


@pytest.fixture(scope="module")
def db_engine():
    models.Base.metadata.create_all(bind=database.engine)
    return database.engine


@pytest.fixture()
def db_session(db_engine):
    """One transaction per test, rolled back at the end -> tests never
    pollute each other or leave junk data behind."""
    connection = db_engine.connect()
    transaction = connection.begin()
    Session = database.sessionmaker(bind=connection)
    session = Session()

    def override_get_db():
        try:
            yield session
        finally:
            pass

    main.app.dependency_overrides[database.get_db] = override_get_db
    yield session
    session.close()
    
    # FIX: Check if transaction is active before rollback to prevent SAWarning
    if transaction.is_active:
        transaction.rollback()
        
    connection.close()
    main.app.dependency_overrides.clear()


@pytest.fixture()
def client(db_session):
    return TestClient(main.app)


@pytest.fixture()
def seeded_clinic_and_patients(db_session):
    """Seeds 1 clinic + 5 patients that SHOULD be bookable."""
    clinic = models.Clinic(id=uuid.uuid4(), name="Test Clinic", registration_number=f"REG-{uuid.uuid4()}")
    db_session.add(clinic)
    db_session.flush()

    patients = []
    for i in range(5):
        p = models.Patient(
            id=uuid.uuid4(),
            ic_passport_number=f"90010114{5000+i}",
            clinic_id=clinic.id,
            name=f"Test Patient {i}",
            phone="+60123456789",
        )
        db_session.add(p)
        patients.append(p)
    db_session.flush()
    db_session.commit()
    return clinic, patients


def test_booking_success_rate(client, seeded_clinic_and_patients, record_property):
    clinic, patients = seeded_clinic_and_patients

    attempts = []

    # 5 attempts that SHOULD succeed: real patient, real clinic, future weekday time
    for p in patients:
        attempts.append({
            "clinic_id": str(clinic.id),
            "telegram_id": 0,
            "ic_passport_number": p.ic_passport_number,
            "service_type": "General",
            "details": {"general_notes": "Routine checkup"},
            "scheduled_time": "2027-03-10 10:00:00",  # Wednesday
            "skip_notification": True,   # never hit real Telegram/SMS in tests
            "source": "web",
        })

    # 3 attempts that SHOULD fail: unknown patient IC (never seeded)
    for i in range(3):
        attempts.append({
            "clinic_id": str(clinic.id),
            "telegram_id": 0,
            "ic_passport_number": f"UNKNOWN-IC-{i}",
            "service_type": "General",
            "details": {"general_notes": "Routine checkup"},
            "scheduled_time": "2027-03-10 10:00:00",
            "skip_notification": True,
            "source": "web",
        })

    results = [client.post("/book-appointment", json=payload) for payload in attempts]

    successes = sum(1 for r in results if r.status_code == 200 and r.json().get("status") == "success")
    success_rate = successes / len(results)

    # Pass specific internal metrics to conftest.py
    record_property("custom_total", len(results))
    record_property("custom_passed", successes)
    record_property("custom_failed", len(results) - successes)

    # The 5 valid bookings must succeed
    valid_results = results[:5]
    assert all(r.status_code == 200 for r in valid_results), \
        f"Expected all valid bookings to succeed, got: {[r.json() for r in valid_results]}"

    # The 3 unknown-patient bookings must fail with 404 (per book_appointment's own logic)
    invalid_results = results[5:]
    assert all(r.status_code == 404 for r in invalid_results)

    # Overall metric for your FYP report
    assert success_rate >= 0.5
