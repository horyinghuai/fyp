from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, BigInteger, JSON, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, relationship
import uuid
import datetime

class Base(DeclarativeBase):
    pass

class Patient(Base):
    __tablename__ = "patients"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    telegram_id = Column(BigInteger, unique=True) # For Telegram Bot interface
    phone = Column(String(20))

class Appointment(Base):
    __tablename__ = "appointments"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"))
    doctor_id = Column(UUID(as_uuid=True), ForeignKey("doctors.id"))
    appt_type = Column(String(50)) # e.g., "Vaccination", "Chronic Follow-up"
    total_stages = Column(Integer, default=1)
    
    stages = relationship("ApptStage", back_populates="appointment")

class ApptStage(Base):
    __tablename__ = "appt_stages"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id = Column(UUID(as_uuid=True), ForeignKey("appointments.id"))
    stage_name = Column(String(100)) # e.g., "Dose 1", "Dose 2"
    scheduled_time = Column(DateTime)
    status = Column(String(20), default="scheduled")
    
    # Self-referential for multi-stage dependency
    depends_on_stage_id = Column(UUID(as_uuid=True), ForeignKey("appt_stages.id"), nullable=True)
    
    appointment = relationship("Appointment", back_populates="stages")

class AgentLog(Base):
    __tablename__ = "agent_logs"
    id = Column(BigInteger, primary_key=True)
    action = Column(String(255))
    reasoning = Column(String) # For Human Oversight/Transparency
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)