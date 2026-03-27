from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, BigInteger, JSON, Numeric, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.schema import UniqueConstraint
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

class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), default='admin')

class Doctor(Base):
    __tablename__ = "doctors"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    specialization = Column(String(100))
    availability_slots = Column(JSON)

class Vaccine(Base):
    __tablename__ = "vaccines"
    id = Column(Integer, primary_key=True)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100))
    price = Column(Numeric(10, 2))
    stock_quantity = Column(Integer)
    low_stock_threshold = Column(Integer)
    total_doses = Column(Integer, default=1) 
    has_booster = Column(Boolean, default=False) 
    dose_durations = Column(JSON) 

class BloodTest(Base):
    __tablename__ = "blood_tests"
    id = Column(Integer, primary_key=True)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100))
    price = Column(Numeric(10, 2))
    description = Column(String)
    test_type = Column(String(20)) 
    included_tests = Column(JSON) # ADDED: To store the single tests in a package

class Patient(Base):
    __tablename__ = "patients"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255))
    ic_passport_number = Column(String(20)) 
    telegram_id = Column(BigInteger) 
    phone = Column(String(20))
    address = Column(String) 
    gender = Column(String(10)) 
    nationality = Column(String(50)) 
    
    __table_args__ = (UniqueConstraint('clinic_id', 'ic_passport_number', name='_clinic_patient_uc'),)

class Appointment(Base):
    __tablename__ = "appointments"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"))
    doctor_id = Column(UUID(as_uuid=True), ForeignKey("doctors.id"), nullable=True) 
    appt_type = Column(String(50)) 
    total_stages = Column(Integer, default=1)
    details = Column(JSON)
    
    stages = relationship("ApptStage", back_populates="appointment", cascade="all, delete-orphan")

class ApptStage(Base):
    __tablename__ = "appt_stages"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id = Column(UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="CASCADE"))
    stage_name = Column(String(100))
    scheduled_time = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String(20), default="scheduled")
    appointment = relationship("Appointment", back_populates="stages")