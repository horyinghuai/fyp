from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, BigInteger, Numeric, Boolean, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import datetime
from database import Base

class Clinic(Base):
    __tablename__ = "clinics"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    registration_number = Column(String(100))
    address = Column(String)
    contact_number = Column(String(20))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class User(Base):
    __tablename__ = "users"
    ic_passport_number = Column(String(20), primary_key=True)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), default='admin')
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Doctor(Base):
    __tablename__ = "doctors"
    ic_passport_number = Column(String(20), primary_key=True)
    name = Column(String(255), nullable=False)
    gender = Column(String(10)) 
    specialization = Column(String(100))

class Patient(Base):
    __tablename__ = "patients"
    ic_passport_number = Column(String(20), primary_key=True)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    telegram_id = Column(BigInteger) 
    phone = Column(String(20))
    address = Column(String) 
    gender = Column(String(10)) 
    nationality = Column(String(50)) 

class Appointment(Base):
    __tablename__ = "appointments"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False)
    patient_ic = Column(String(20), ForeignKey("patients.ic_passport_number", ondelete="CASCADE"), nullable=False)
    doctor_ic = Column(String(20), ForeignKey("doctors.ic_passport_number"), nullable=True) 
    appt_type = Column(String(50)) 
    total_stages = Column(Integer, default=1)
    general_notes = Column(String(255), nullable=True)
    
    stages = relationship("ApptStage", back_populates="appointment", cascade="all, delete-orphan")

class ApptStage(Base):
    __tablename__ = "appt_stages"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id = Column(UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="CASCADE"))
    stage_name = Column(String(100))
    scheduled_time = Column(DateTime)
    status = Column(String(20), default="scheduled")
    depends_on_stage_id = Column(UUID(as_uuid=True), ForeignKey("appt_stages.id"), nullable=True)
    appointment = relationship("Appointment", back_populates="stages")

class AgentLog(Base):
    __tablename__ = "agent_logs"
    id = Column(Integer, primary_key=True)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="CASCADE"))
    action = Column(String(255))
    reasoning = Column(String)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

class BloodTest(Base):
    __tablename__ = "blood_tests"
    id = Column(Integer, primary_key=True)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    price = Column(Numeric(10, 2), nullable=False)
    description = Column(String)
    test_type = Column(String(20), nullable=False) 

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False)
    telegram_id = Column(BigInteger)
    message = Column(String)
    reply = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String(20), default='unread')

class Vaccine(Base):
    __tablename__ = "vaccines"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    type = Column(String(50))
    total_doses = Column(Integer, default=1) 
    has_booster = Column(Boolean, default=False) 

# ========================================================
# BRIDGE TABLES
# ========================================================

class DoctorClinicAvailability(Base):
    __tablename__ = "doctor_clinic_availability"
    doctor_ic = Column(String(20), ForeignKey("doctors.ic_passport_number", ondelete="CASCADE"), primary_key=True)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="CASCADE"), primary_key=True)
    day_of_week = Column(String(10), primary_key=True)
    start_time = Column(Time, primary_key=True)
    end_time = Column(Time)

class VaccineClinic(Base):
    __tablename__ = "vaccine_clinic"
    vaccine_id = Column(Integer, ForeignKey("vaccines.id", ondelete="CASCADE"), primary_key=True)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="CASCADE"), primary_key=True)
    price = Column(Numeric(10, 2), nullable=False)
    stock_quantity = Column(Integer, nullable=False)
    low_stock_threshold = Column(Integer, default=5, nullable=False)

class AppointmentVaccine(Base):
    __tablename__ = "appointment_vaccines"
    appointment_id = Column(UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="CASCADE"), primary_key=True)
    vaccine_id = Column(Integer, ForeignKey("vaccines.id", ondelete="CASCADE"), primary_key=True)
    dose_number = Column(String(50))
    notes = Column(String(100))

class AppointmentBloodTest(Base):
    __tablename__ = "appointment_blood_tests"
    appointment_id = Column(UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="CASCADE"), primary_key=True)
    blood_test_id = Column(Integer, ForeignKey("blood_tests.id", ondelete="CASCADE"), primary_key=True)
    notes = Column(String(100))

class VaccineDoseSchedule(Base):
    __tablename__ = "vaccine_dose_schedules"
    id = Column(Integer, primary_key=True)
    vaccine_id = Column(Integer, ForeignKey("vaccines.id", ondelete="CASCADE"))
    dose_number = Column(Integer)
    interval_description = Column(String(50))

class BloodTestComponent(Base):
    __tablename__ = "blood_test_components"
    package_id = Column(Integer, ForeignKey("blood_tests.id", ondelete="CASCADE"), primary_key=True)
    test_id = Column(Integer, ForeignKey("blood_tests.id", ondelete="CASCADE"), primary_key=True)