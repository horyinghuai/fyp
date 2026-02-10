from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, BigInteger, JSON, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import datetime
from database import Base

class Vaccine(Base):
    __tablename__ = "vaccines"
    id = Column(Integer, primary_key=True)
    name = Column(String(100))
    price = Column(Numeric(10, 2))
    stock_quantity = Column(Integer)
    low_stock_threshold = Column(Integer)

class BloodTest(Base):
    __tablename__ = "blood_tests"
    id = Column(Integer, primary_key=True)
    name = Column(String(100))
    price = Column(Numeric(10, 2))
    description = Column(String)
    test_type = Column(String(20)) # 'package' or 'single'

class Patient(Base):
    __tablename__ = "patients"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255))
    ic_number = Column(String(20), unique=True)
    telegram_id = Column(BigInteger, unique=True)
    phone = Column(String(20))

class Appointment(Base):
    __tablename__ = "appointments"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"))
    appt_type = Column(String(50)) 
    details = Column(JSON) # Stores quantities (D1/D2) or test selections
    
    stages = relationship("ApptStage", back_populates="appointment", cascade="all, delete-orphan")

class ApptStage(Base):
    __tablename__ = "appt_stages"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id = Column(UUID(as_uuid=True), ForeignKey("appointments.id"))
    stage_name = Column(String(100))
    scheduled_time = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String(20), default="scheduled")
    appointment = relationship("Appointment", back_populates="stages")