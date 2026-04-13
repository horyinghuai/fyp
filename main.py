from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import get_db
import models
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from agent import extract_appointment_details, generate_vaccine_schedule_ai
from datetime import datetime, timedelta
import random
import re
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

app = FastAPI(title="Clinic Smart Assistant Backend")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

class UserLogin(BaseModel):
    email: str
    password: str

class ForgotPasswordReq(BaseModel):
    email: str

class UserUpdate(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None

class DoctorCreateReq(BaseModel):
    clinic_id: str
    ic: str
    name: str
    gender: str
    specialization: Optional[str] = None

class DoctorScheduleReq(BaseModel):
    clinic_id: str
    day_of_week: str
    start_time: str
    end_time: str

class PatientRegister(BaseModel):
    clinic_id: str
    name: str
    ic_passport_number: str
    phone: str
    telegram_id: Optional[int] = None
    address: Optional[str] = None
    gender: Optional[str] = None
    nationality: Optional[str] = None

class PatientUpdate(BaseModel):
    ic_passport_number: str
    name: str
    phone: str
    gender: str
    nationality: str
    address: Optional[str] = None

class VaccineCreate(BaseModel):
    clinic_id: str
    vaccine_id: Optional[int] = None
    name: Optional[str] = None
    type: Optional[str] = None
    total_doses: Optional[int] = None
    has_booster: Optional[bool] = None
    schedules: Optional[List[Dict[str, Any]]] = []
    price: float
    stock_quantity: int
    low_stock_threshold: int

class VaccineAIRequest(BaseModel):
    search_query: str

class BloodTestCreate(BaseModel):
    clinic_id: str
    name: str
    description: Optional[str] = None 
    price: float
    test_type: str
    component_ids: Optional[List[int]] = [] 

class Booking(BaseModel):
    clinic_id: str
    telegram_id: Optional[int] = 0
    ic_passport_number: str 
    service_type: str
    details: Dict[str, Any]
    scheduled_time: str

class UpdateBooking(BaseModel):
    appt_id: str
    service_type: str
    details: Dict[str, Any]
    scheduled_time: str
    status: Optional[str] = "scheduled"

class ChatMessageModel(BaseModel):
    clinic_id: str
    telegram_id: int
    message: str

class TextExtractRequest(BaseModel):
    text: str

class DateRequest(BaseModel):
    clinic_id: str
    duration: int
    doctor_pref: Optional[str] = None

class TimeRequest(BaseModel):
    clinic_id: str
    date: str
    duration: int
    doctor_pref: Optional[str] = None

class AvailabilityRequest(BaseModel):
    clinic_id: str
    requested_time: str
    duration: int
    doctor_pref: Optional[str] = None

class AdminChatReply(BaseModel):
    clinic_id: str
    question: str
    answer: str

def logging_agent(db: Session, clinic_id: str, action: str, reasoning: str):
    log = models.AgentLog(clinic_id=clinic_id, action=action, reasoning=reasoning)
    db.add(log)
    db.commit()

# Improved logic to parse intelligent intervals like '4 months after dose 1'
def calculate_future_date(start_date: datetime, interval_str: str) -> Optional[datetime]:
    if not interval_str or interval_str.strip().lower() in ["", "initial", "none", "blank"]:
        return None
    interval_str = interval_str.lower()
    try:
        match = re.search(r'\d+', interval_str)
        amount = int(match.group()) if match else 1

        if 'year' in interval_str or 'annual' in interval_str: return start_date + timedelta(days=365 * amount)
        elif 'month' in interval_str: return start_date + timedelta(days=30 * amount)
        elif 'week' in interval_str: return start_date + timedelta(weeks=amount)
        elif 'day' in interval_str: return start_date + timedelta(days=amount)
    except: pass
    return start_date + timedelta(days=30) 

def normalize_vaccine_type(db: Session, given_type: str):
    if not given_type: return "Other"
    given_lower = given_type.lower().strip()
    existing_types = db.query(models.Vaccine.type).distinct().all()
    
    for (t,) in existing_types:
        if t:
            t_lower = t.lower().strip()
            if t_lower in given_lower or given_lower in t_lower:
                return t.title()
    return given_type.title()

@app.get("/admin/appointments/{clinic_id}")
def admin_get_all_appointments(clinic_id: str, db: Session = Depends(get_db)):
    try:
        appointments = db.query(models.Appointment).filter(models.Appointment.clinic_id == clinic_id).all()
        appt_ids = [a.id for a in appointments]
        if not appt_ids: return []
        
        stages = db.query(models.ApptStage).filter(models.ApptStage.appointment_id.in_(appt_ids)).all()
        appt_dict = {str(a.id): a for a in appointments}
        
        patient_ics = list({a.patient_ic for a in appointments if a.patient_ic})
        patients = db.query(models.Patient).filter(models.Patient.ic_passport_number.in_(patient_ics)).all() if patient_ics else []
        patient_dict = {str(p.ic_passport_number): p for p in patients}
        
        doctor_ics = list({a.doctor_ic for a in appointments if a.doctor_ic})
        doctors = db.query(models.Doctor).filter(models.Doctor.ic_passport_number.in_(doctor_ics)).all() if doctor_ics else []
        doctor_dict = {str(d.ic_passport_number): d for d in doctors}

        appt_vaccines = db.query(models.AppointmentVaccine).filter(models.AppointmentVaccine.appointment_id.in_(appt_ids)).all() if appt_ids else []
        appt_tests = db.query(models.AppointmentBloodTest).filter(models.AppointmentBloodTest.appointment_id.in_(appt_ids)).all() if appt_ids else []
        
        vac_dict = {}
        for av in appt_vaccines:
            key = str(av.appointment_id)
            if key not in vac_dict: vac_dict[key] = []
            vac_dict[key].append(av)
            
        test_dict = {}
        for at in appt_tests:
            key = str(at.appointment_id)
            if key not in test_dict: test_dict[key] = []
            test_dict[key].append(at)
            
        all_vacs = db.query(models.Vaccine).all()
        v_name_map = {v.id: v.name for v in all_vacs}
        
        all_tests = db.query(models.BloodTest).all()
        t_name_map = {t.id: t.name for t in all_tests}

        result = []
        for stage in stages:
            if not stage.scheduled_time: continue
            appt = appt_dict.get(str(stage.appointment_id))
            if not appt: continue
            
            patient = patient_dict.get(str(appt.patient_ic))
            doctor = doctor_dict.get(str(appt.doctor_ic)) if appt.doctor_ic else None

            key = str(appt.id)
            items_list = []
            dose_val = stage.stage_name
            total_doses = appt.total_stages

            service = "Consultation"
            color = "#3B82F6" 

            if key in vac_dict:
                service = "Vaccine"
                color = "#A855F7"
                for av in vac_dict[key]:
                    v_name = v_name_map.get(av.vaccine_id, "Unknown Vaccine")
                    items_list.append(v_name)
                    dose_val = stage.stage_name if stage.stage_name.startswith("Dose") else av.dose_number
            elif key in test_dict:
                service = "Blood Test"
                color = "#EF4444"
                for at in test_dict[key]:
                    t_name = t_name_map.get(at.blood_test_id, "Unknown Test")
                    items_list.append(t_name)
            else:
                if appt.appt_type == "follow-up": color = "#F97316"

            start_str = stage.scheduled_time.strftime("%Y-%m-%dT%H:%M:%S")
            end_str = (stage.scheduled_time + timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%S")

            patient_name = patient.name if patient else 'Unknown Patient'

            result.append({
                "id": str(stage.id),
                "appt_id": str(appt.id),
                "title": f"{patient_name} - {service}",
                "patient_name": patient_name,
                "stage_name": stage.stage_name, 
                "start": start_str,
                "end": end_str,
                "patient_ic": patient.ic_passport_number if patient else "",
                "doctor": doctor.name if doctor else "Unassigned",
                "doctor_ic": str(doctor.ic_passport_number) if doctor else "",
                "type": appt.appt_type,
                "service": service,
                "items": items_list,
                "dose": dose_val,
                "total_doses": total_doses,
                "reason": appt.general_notes or "",
                "status": stage.status,
                "color": color
            })
        return result
    except Exception as e:
        print(f"DASHBOARD CRASH PREVENTED: {e}")
        return []

@app.put("/admin/appointment-stages/{stage_id}")
def admin_update_stage(stage_id: str, data: dict, db: Session = Depends(get_db)):
    stage = db.query(models.ApptStage).filter_by(id=stage_id).first()
    if not stage: raise HTTPException(status_code=404)
    if 'status' in data: stage.status = data['status']
    if 'scheduled_time' in data:
        dt_str = data['scheduled_time'].replace("T", " ")
        if len(dt_str) == 16: dt_str += ":00"
        stage.scheduled_time = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
        
    if 'doctor_ic' in data:
        appt = db.query(models.Appointment).filter_by(id=stage.appointment_id).first()
        if appt:
            appt.doctor_ic = data['doctor_ic'] if data['doctor_ic'] else None

    db.commit()
    return {"status": "success"}

@app.get("/admin/patients/{clinic_id}")
def admin_get_patients(clinic_id: str, db: Session = Depends(get_db)):
    return db.query(models.Patient).filter(models.Patient.clinic_id == clinic_id).all()

@app.put("/admin/patients/{ic}")
def admin_update_patient(ic: str, data: PatientUpdate, db: Session = Depends(get_db)):
    p = db.query(models.Patient).filter_by(ic_passport_number=ic).first()
    if p:
        try:
            if data.ic_passport_number and data.ic_passport_number != ic:
                p.ic_passport_number = data.ic_passport_number
            p.name = data.name.title()
            p.phone = data.phone
            p.gender = data.gender
            p.nationality = data.nationality
            p.address = data.address
            db.commit()
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=400, detail=f"Update failed: {e}")
    return {"status": "success"}

@app.delete("/admin/patients/{ic}")
def admin_delete_patient(ic: str, db: Session = Depends(get_db)):
    db.query(models.Patient).filter_by(ic_passport_number=ic).delete()
    db.commit()
    return {"status": "success"}

@app.get("/admin/global-vaccines")
def get_global_vaccines(db: Session = Depends(get_db)):
    vaccines = db.query(models.Vaccine).all()
    res = []
    for v in vaccines:
        scheds = db.query(models.VaccineDoseSchedule).filter_by(vaccine_id=v.id).all()
        res.append({
            "id": v.id, "name": v.name, "type": v.type, 
            "total_doses": v.total_doses, "has_booster": v.has_booster,
            "schedules": [{"dose_number": s.dose_number, "interval_description": s.interval_description} for s in scheds]
        })
    return res

@app.post("/admin/ai/vaccine-schedule")
async def ai_vaccine_schedule(req: VaccineAIRequest):
    return await generate_vaccine_schedule_ai(req.search_query)

@app.post("/admin/vaccines")
def create_vaccine(data: VaccineCreate, db: Session = Depends(get_db)):
    try:
        v_id = data.vaccine_id
        formatted_name = data.name.title() if data.name else None
        
        if not v_id and formatted_name:
            existing_v = db.query(models.Vaccine).filter(models.Vaccine.name.ilike(formatted_name)).first()
            if existing_v:
                v_id = existing_v.id
                
        if not v_id:
            normalized_type = normalize_vaccine_type(db, data.type)
            v = models.Vaccine(name=formatted_name, type=normalized_type, total_doses=data.total_doses, has_booster=data.has_booster)
            db.add(v)
            db.flush() 
            v_id = v.id
            for sched in data.schedules:
                db.add(models.VaccineDoseSchedule(vaccine_id=v_id, dose_number=sched.get('dose_number'), interval_description=sched.get('interval_description')))
            db.flush() 
            
        elif v_id:
            # When grabbing an existing from DB and modifying it, update global record as well
            v = db.query(models.Vaccine).filter_by(id=v_id).first()
            if v:
                v.name = formatted_name
                v.type = normalize_vaccine_type(db, data.type)
                v.total_doses = data.total_doses
                v.has_booster = data.has_booster
            db.query(models.VaccineDoseSchedule).filter_by(vaccine_id=v_id).delete()
            for sched in data.schedules:
                db.add(models.VaccineDoseSchedule(vaccine_id=v_id, dose_number=sched.get('dose_number'), interval_description=sched.get('interval_description')))
            db.flush()

        existing_vc = db.query(models.VaccineClinic).filter_by(vaccine_id=v_id, clinic_id=data.clinic_id).first()
        if existing_vc:
            existing_vc.price = data.price
            existing_vc.stock_quantity = data.stock_quantity
            existing_vc.low_stock_threshold = data.low_stock_threshold
        else:
            vc = models.VaccineClinic(vaccine_id=v_id, clinic_id=data.clinic_id, price=data.price, stock_quantity=data.stock_quantity, low_stock_threshold=data.low_stock_threshold)
            db.add(vc)
            
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/admin/vaccines/{v_id}")
def update_vaccine(v_id: int, data: VaccineCreate, db: Session = Depends(get_db)):
    try:
        v = db.query(models.Vaccine).filter_by(id=v_id).first()
        if v:
            v.name = data.name.title() if data.name else ""
            v.type = normalize_vaccine_type(db, data.type)
            v.total_doses = data.total_doses
            v.has_booster = data.has_booster
            
        vc = db.query(models.VaccineClinic).filter_by(vaccine_id=v_id, clinic_id=data.clinic_id).first()
        if vc: 
            vc.price = data.price
            vc.stock_quantity = data.stock_quantity
            vc.low_stock_threshold = data.low_stock_threshold

        # Overwrite Schedules
        db.query(models.VaccineDoseSchedule).filter_by(vaccine_id=v_id).delete()
        for sched in data.schedules:
            db.add(models.VaccineDoseSchedule(vaccine_id=v_id, dose_number=sched.get('dose_number'), interval_description=sched.get('interval_description')))

        db.flush()

        # Recalculate scheduled_time for existing future appointments 
        now = datetime.now()
        appt_vacs = db.query(models.AppointmentVaccine).filter_by(vaccine_id=v_id).all()
        for av in appt_vacs:
            appt_id = av.appointment_id
            stages = db.query(models.ApptStage).filter_by(appointment_id=appt_id).order_by(models.ApptStage.scheduled_time.asc()).all()
            stage_dict = {s.stage_name.lower(): s for s in stages}
            
            dose1_stage = stage_dict.get("dose 1") or stage_dict.get("single dose")
            if not dose1_stage or not dose1_stage.scheduled_time:
                continue
            
            base_date = dose1_stage.scheduled_time
            prev_date = base_date
            
            for sched in data.schedules:
                d_num = sched.get('dose_number')
                interval = sched.get('interval_description', '').strip()
                
                if d_num == 1:
                    continue
                    
                stage_name = f"dose {d_num}" if d_num <= data.total_doses else "booster"
                stage = stage_dict.get(stage_name)
                
                if not stage:
                    continue
                    
                # Skip altering past or completed tasks
                if stage.status == "completed" or stage.scheduled_time < now:
                    prev_date = stage.scheduled_time
                    continue
                    
                if not interval:
                    # User left blank, meaning it's optionally unrequired.
                    continue
                    
                # Intelligent Semantic Check: Calculate from Base date (Dose 1) or previous dose's date
                if "dose 1" in interval.lower():
                    new_date = calculate_future_date(base_date, interval)
                else:
                    new_date = calculate_future_date(prev_date, interval)
                    
                if new_date:
                    stage.scheduled_time = new_date
                    prev_date = new_date

        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/admin/vaccines/{v_id}/{clinic_id}")
def delete_vaccine(v_id: int, clinic_id: str, db: Session = Depends(get_db)):
    db.query(models.VaccineClinic).filter_by(vaccine_id=v_id, clinic_id=clinic_id).delete()
    db.commit()
    return {"status": "success"}

@app.post("/admin/blood-tests")
def create_bt(data: BloodTestCreate, db: Session = Depends(get_db)):
    try:
        bt = models.BloodTest(clinic_id=data.clinic_id, name=data.name.title(), description=data.description, price=data.price, test_type=data.test_type)
        db.add(bt)
        db.flush()
        if data.test_type == 'package' and data.component_ids:
            for cid in data.component_ids:
                db.add(models.BloodTestComponent(package_id=bt.id, test_id=cid))
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/admin/blood-tests/{bt_id}")
def update_bt(bt_id: int, data: BloodTestCreate, db: Session = Depends(get_db)):
    try:
        bt = db.query(models.BloodTest).filter_by(id=bt_id).first()
        if bt:
            bt.name, bt.description, bt.price, bt.test_type = data.name.title(), data.description, data.price, data.test_type
            if data.test_type == 'package':
                db.query(models.BloodTestComponent).filter_by(package_id=bt.id).delete()
                for cid in data.component_ids:
                    db.add(models.BloodTestComponent(package_id=bt.id, test_id=cid))
            db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/admin/blood-tests/{bt_id}")
def delete_bt(bt_id: int, db: Session = Depends(get_db)):
    db.query(models.BloodTest).filter_by(id=bt_id).delete()
    db.commit()
    return {"status": "success"}

@app.post("/admin/auto-replies")
def admin_add_chatbot_reply(data: AdminChatReply, db: Session = Depends(get_db)):
    new_msg = models.ChatMessage(clinic_id=data.clinic_id, message=data.question, reply=data.answer, status='auto_rule')
    db.add(new_msg)
    db.commit()
    logging_agent(db, data.clinic_id, "Automated Message Updated", f"Admin added rule for: {data.question}")
    return {"status": "success"}

@app.post("/ask-admin")
def ask_admin(msg: ChatMessageModel, db: Session = Depends(get_db)):
    new_msg = models.ChatMessage(clinic_id=msg.clinic_id, telegram_id=msg.telegram_id, message=msg.message)
    db.add(new_msg)
    db.commit()
    return {"status": "success"}

@app.post("/ai-extract")
async def ai_extract(req: TextExtractRequest):
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    extracted = await extract_appointment_details(req.text, now_str)
    if isinstance(extracted, dict) and "error" in extracted: return extracted
    return extracted.dict()

@app.get("/clinic/{clinic_id}")
def get_clinic(clinic_id: str, db: Session = Depends(get_db)):
    clinic = db.query(models.Clinic).filter(models.Clinic.id == clinic_id).first()
    if not clinic: raise HTTPException(status_code=404)
    return clinic

@app.get("/doctors/{clinic_id}")
def get_doctors(clinic_id: str, db: Session = Depends(get_db)):
    doctors = db.query(models.Doctor).join(
        models.DoctorClinicAvailability, models.Doctor.ic_passport_number == models.DoctorClinicAvailability.doctor_ic
    ).filter(models.DoctorClinicAvailability.clinic_id == clinic_id).distinct().all()
    return doctors

@app.get("/vaccines/{clinic_id}")
def get_vaccines(clinic_id: str, db: Session = Depends(get_db)):
    results = db.query(
        models.Vaccine.id, models.Vaccine.name, models.Vaccine.type, 
        models.Vaccine.total_doses, models.Vaccine.has_booster, 
        models.VaccineClinic.price, models.VaccineClinic.stock_quantity, models.VaccineClinic.low_stock_threshold
    ).join(
        models.VaccineClinic, models.Vaccine.id == models.VaccineClinic.vaccine_id
    ).filter(models.VaccineClinic.clinic_id == clinic_id).all()
    
    vaccines = []
    for r in results:
        schedules = db.query(models.VaccineDoseSchedule).filter_by(vaccine_id=r.id).all()
        sched_list = [{"dose_number": s.dose_number, "interval_description": s.interval_description} for s in schedules]
        vaccines.append({
            "id": r.id, "name": r.name, "type": r.type, "total_doses": r.total_doses, "has_booster": r.has_booster, 
            "price": float(r.price), "stock_quantity": r.stock_quantity, "low_stock_threshold": r.low_stock_threshold,
            "schedules": sched_list
        })
    return vaccines

@app.get("/blood-tests/{clinic_id}/{test_type}")
def get_blood_tests(clinic_id: str, test_type: str, db: Session = Depends(get_db)):
    tests = db.query(models.BloodTest).filter(models.BloodTest.clinic_id == clinic_id, models.BloodTest.test_type == test_type).all()
    results = []
    for t in tests:
        t_dict = {"id": t.id, "name": t.name, "price": float(t.price), "description": t.description, "test_type": t.test_type}
        if test_type == "package":
            components = db.query(models.BloodTestComponent).filter(models.BloodTestComponent.package_id == t.id).all()
            included_names = []
            component_ids = []
            for comp in components:
                child = db.query(models.BloodTest).filter(models.BloodTest.id == comp.test_id).first()
                if child: 
                    included_names.append(child.name)
                    component_ids.append(comp.test_id)
            t_dict["included_tests"] = included_names
            t_dict["component_ids"] = component_ids
        results.append(t_dict)
    return results

@app.get("/patient/{clinic_id}/id/{ic_passport}")
def get_patient_by_id(clinic_id: str, ic_passport: str, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(models.Patient.clinic_id == clinic_id, models.Patient.ic_passport_number == ic_passport).first()
    if not patient: raise HTTPException(status_code=404)
    return patient

@app.get("/patient/{clinic_id}/appointments/{ic}")
def get_patient_appointments(clinic_id: str, ic: str, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(models.Patient.clinic_id == clinic_id, models.Patient.ic_passport_number == ic).first()
    if not patient: raise HTTPException(status_code=404)
    
    now = datetime.now()
    appts = db.query(models.Appointment, models.ApptStage, models.Doctor).join(
        models.ApptStage, models.Appointment.id == models.ApptStage.appointment_id
    ).outerjoin(
        models.Doctor, models.Appointment.doctor_ic == models.Doctor.ic_passport_number
    ).filter(
        models.Appointment.patient_ic == patient.ic_passport_number,
        models.ApptStage.scheduled_time >= now,
        models.ApptStage.status != 'canceled'
    ).all()

    res = []
    for appt, stage, doc in appts:
        appt_vaccines = db.query(models.AppointmentVaccine).filter_by(appointment_id=appt.id).all()
        appt_tests = db.query(models.AppointmentBloodTest).filter_by(appointment_id=appt.id).all()
        service = "Others"
        item_names = []
        dose = None
        reason = appt.general_notes
        
        if appt_vaccines:
            service = "Vaccine"
            for av in appt_vaccines:
                dose = av.dose_number
                v = db.query(models.Vaccine).filter_by(id=av.vaccine_id).first()
                if v: item_names.append(v.name)
        elif appt_tests:
            service = "Blood Test"
            for at in appt_tests:
                bt = db.query(models.BloodTest).filter_by(id=at.blood_test_id).first()
                if bt: item_names.append(bt.name)
        elif reason:
            service = "Others"
                
        details_block = { "items": item_names, "dose": dose, "reason": reason, "assigned_doctor_name": doc.name if doc else "ANY", "assigned_doctor_id": str(doc.ic_passport_number) if doc else None, "service_type": service }
        res.append({ "appt_id": str(appt.id), "service": service, "details": details_block, "date": stage.scheduled_time.strftime("%Y-%m-%d"), "time": stage.scheduled_time.strftime("%H:%M:%S"), "doctor_name": doc.name if doc else "ANY" })
    return res

@app.post("/register-patient")
def register_patient(data: PatientRegister, db: Session = Depends(get_db)):
    try:
        data_dict = data.dict(exclude_unset=True)
        existing = db.query(models.Patient).filter(models.Patient.clinic_id == data.clinic_id, models.Patient.ic_passport_number == data.ic_passport_number).first()
        if existing:
            return {"status": "error", "reason": "Patient IC already exists. Registration aborted."}
        data_dict['name'] = data_dict['name'].title() # Capitalize names
        new_patient = models.Patient(**data_dict)
        db.add(new_patient)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

def get_doctors_and_slots_for_date(db: Session, clinic_id: str, date_obj: datetime.date, duration: int, doctor_pref: str):
    doc_query = db.query(models.Doctor).join(
        models.DoctorClinicAvailability, models.Doctor.ic_passport_number == models.DoctorClinicAvailability.doctor_ic
    ).filter(models.DoctorClinicAvailability.clinic_id == clinic_id)
    if doctor_pref == "MALE": doc_query = doc_query.filter(models.Doctor.gender == "MALE")
    elif doctor_pref == "FEMALE": doc_query = doc_query.filter(models.Doctor.gender == "FEMALE")
    elif doctor_pref and str(doctor_pref).upper() not in ["ANY", "NONE"]: doc_query = doc_query.filter(models.Doctor.name == doctor_pref)
    valid_docs = doc_query.distinct().all()
    if not valid_docs: return []
    day_of_week = date_obj.strftime("%a").lower()[:3] 
    now = datetime.now()
    start_of_day = datetime.combine(date_obj, datetime.min.time())
    end_of_day = datetime.combine(date_obj, datetime.max.time())
    clashes = db.query(models.ApptStage.scheduled_time, models.Appointment.doctor_ic).join(models.Appointment).filter(models.Appointment.clinic_id == clinic_id, models.ApptStage.scheduled_time >= start_of_day, models.ApptStage.scheduled_time <= end_of_day).all()
    clash_dict = {}
    for c_time, d_ic in clashes:
        if d_ic not in clash_dict: clash_dict[d_ic] = []
        clash_dict[d_ic].append(c_time)
    doc_slots = []
    for doc in valid_docs:
        availabilities = db.query(models.DoctorClinicAvailability).filter(models.DoctorClinicAvailability.doctor_ic == doc.ic_passport_number, models.DoctorClinicAvailability.clinic_id == clinic_id, models.DoctorClinicAvailability.day_of_week == day_of_week).all()
        slots = []
        for avail in availabilities:
            if not avail.start_time or not avail.end_time: continue
            curr = datetime.combine(date_obj, avail.start_time)
            end_dt = datetime.combine(date_obj, avail.end_time)
            busy_times = clash_dict.get(doc.ic_passport_number, [])
            while curr < end_dt:
                if curr > now and curr not in busy_times: slots.append(curr)
                curr += timedelta(minutes=duration)
        if slots: doc_slots.append({"doc": doc, "slots": slots, "free_count": len(slots)})
    return doc_slots

@app.post("/available-dates")
def get_available_dates(req: DateRequest, db: Session = Depends(get_db)):
    valid_dates = []
    today = datetime.now().date()
    for i in range(14):
        d = today + timedelta(days=i)
        doc_slots = get_doctors_and_slots_for_date(db, req.clinic_id, d, req.duration, req.doctor_pref)
        if doc_slots: valid_dates.append(d.strftime("%Y-%m-%d"))
    return valid_dates

@app.post("/available-times")
def get_available_times(req: TimeRequest, db: Session = Depends(get_db)):
    d_obj = datetime.strptime(req.date, "%Y-%m-%d").date()
    doc_slots = get_doctors_and_slots_for_date(db, req.clinic_id, d_obj, req.duration, req.doctor_pref)
    if not doc_slots: return {"error": "No slots available"}
    all_times = set()
    for ds in doc_slots:
        for s in ds['slots']: all_times.add(s.strftime("%H:%M:%S"))
    sorted_times = sorted(list(all_times))
    return {"times": sorted_times, "doctor_name": "Pending Selection"}

@app.post("/check-availability")
def check_availability(req: AvailabilityRequest, db: Session = Depends(get_db)):
    try: req_dt = datetime.strptime(req.requested_time, "%Y-%m-%d %H:%M:%S")
    except: return {"is_valid": False, "reason": "Invalid format.", "suggestions": []}
    date_obj = req_dt.date()
    now = datetime.now()
    def find_nearest_3_slots(start_date):
        sugs_set = set()
        for i in range(7):
            d = start_date + timedelta(days=i)
            if d < now.date(): continue
            d_slots = get_doctors_and_slots_for_date(db, req.clinic_id, d, req.duration, req.doctor_pref)
            for ds in d_slots:
                for s in ds['slots']:
                    if s > now:
                        sugs_set.add(s.strftime("%Y-%m-%d %H:%M:%S"))
                        if len(sugs_set) >= 3: return sorted(list(sugs_set))
            if len(sugs_set) >= 3: return sorted(list(sugs_set))
        return sorted(list(sugs_set))
    if req_dt < now: return {"is_valid": False, "reason": "You cannot book an appointment in the past.", "suggestions": find_nearest_3_slots(now.date())}
    doc_slots = get_doctors_and_slots_for_date(db, req.clinic_id, date_obj, req.duration, req.doctor_pref)
    available_docs_for_this_slot = []
    for ds in doc_slots:
        if req_dt in ds['slots']: available_docs_for_this_slot.append(ds)
    if available_docs_for_this_slot:
        max_free = max(ds['free_count'] for ds in available_docs_for_this_slot)
        best_docs = [ds for ds in available_docs_for_this_slot if ds['free_count'] == max_free]
        chosen = random.choice(best_docs)
        return {"is_valid": True, "reason": "Slot available.", "doctor_id": str(chosen['doc'].ic_passport_number), "doctor_name": chosen['doc'].name, "suggestions": []}
    else:
        return {"is_valid": False, "reason": "That exact time is unavailable.", "suggestions": find_nearest_3_slots(date_obj)}

@app.post("/book-appointment")
def book_appointment(booking: Booking, db: Session = Depends(get_db)):
    try:
        patient = db.query(models.Patient).filter(models.Patient.ic_passport_number == booking.ic_passport_number).first()
        if not patient: raise HTTPException(status_code=404, detail="Patient missing")
        
        mapped_appt_type = 'single-visit'
        total_stages = 1
        v_model = None
        dose_val = str(booking.details.get('dose', 'Single Dose'))
        items_list = booking.details.get('items', [])
        start_dose_num = 1
        
        if booking.service_type == 'Vaccine':
            if items_list:
                v_model = db.query(models.Vaccine).filter_by(name=items_list[0]).first()
                if v_model:
                    total_stages = v_model.total_doses + (1 if v_model.has_booster else 0)
                    if dose_val.startswith("Dose "):
                        try: start_dose_num = int(dose_val.split(" ")[1])
                        except: pass
                    elif dose_val == "Booster":
                        start_dose_num = v_model.total_doses + 1
                    
                    if (total_stages - start_dose_num + 1) > 1:
                        mapped_appt_type = 'multi-stage'
        
        doc_ic = booking.details.get('assigned_doctor_id')
        if not doc_ic or str(doc_ic).upper() in ["ANY", "NONE", "NULL"]: doc_ic = None

        new_appt = models.Appointment(
            clinic_id=booking.clinic_id, 
            patient_ic=patient.ic_passport_number, 
            doctor_ic=doc_ic, 
            appt_type=mapped_appt_type, 
            total_stages=total_stages, 
            general_notes=booking.details.get('reason') if booking.service_type in ['Others', 'Consultation'] else None
        )
        db.add(new_appt)
        db.flush() 
        
        start_time = datetime.strptime(booking.scheduled_time, "%Y-%m-%d %H:%M:%S")
        
        if mapped_appt_type == 'multi-stage' and v_model:
            db.add(models.AppointmentVaccine(appointment_id=new_appt.id, vaccine_id=v_model.id, dose_number=dose_val))
            schedules = db.query(models.VaccineDoseSchedule).filter_by(vaccine_id=v_model.id).all()
            base_date = start_time
            current_calc_time = start_time
            prev_stage_id = None
            
            for i in range(start_dose_num, v_model.total_doses + 1):
                stage_name = f"Dose {i}"
                if i > start_dose_num:
                    sched = next((s for s in schedules if s.dose_number == i), None)
                    interval = sched.interval_description if sched else "1 month"
                    if not interval or not interval.strip():
                        continue # Leave optional doses out
                    
                    if "dose 1" in interval.lower():
                        current_calc_time = calculate_future_date(base_date, interval)
                    else:
                        current_calc_time = calculate_future_date(current_calc_time, interval)
                    
                if current_calc_time:
                    stage = models.ApptStage(appointment_id=new_appt.id, stage_name=stage_name, scheduled_time=current_calc_time, depends_on_stage_id=prev_stage_id)
                    db.add(stage)
                    db.flush()
                    prev_stage_id = stage.id 
                
            if v_model.has_booster and start_dose_num <= v_model.total_doses + 1:
                if start_dose_num == v_model.total_doses + 1:
                    current_calc_time = start_time
                else:
                    sched = next((s for s in schedules if s.dose_number == v_model.total_doses + 1), None)
                    interval = sched.interval_description if sched else "6 month"
                    if not interval or not interval.strip():
                        current_calc_time = None
                    else:
                        current_calc_time = calculate_future_date(current_calc_time, interval)
                    
                if current_calc_time:
                    stage = models.ApptStage(appointment_id=new_appt.id, stage_name="Booster", scheduled_time=current_calc_time, depends_on_stage_id=prev_stage_id)
                    db.add(stage)
                    db.flush()
        else:
            if booking.service_type == 'Vaccine' and v_model:
                db.add(models.AppointmentVaccine(appointment_id=new_appt.id, vaccine_id=v_model.id, dose_number=dose_val))
            elif booking.service_type == 'Blood Test':
                for t_name in items_list:
                    bt = db.query(models.BloodTest).filter_by(name=t_name, clinic_id=booking.clinic_id).first()
                    if bt: db.add(models.AppointmentBloodTest(appointment_id=new_appt.id, blood_test_id=bt.id))
                    
            stage = models.ApptStage(appointment_id=new_appt.id, stage_name=booking.details.get("dose", booking.service_type), scheduled_time=start_time)
            db.add(stage)
            
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        print(f"BOOKING FAILED: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/update-appointment")
def update_appointment(booking: UpdateBooking, db: Session = Depends(get_db)):
    try:
        appt = db.query(models.Appointment).filter(models.Appointment.id == booking.appt_id).first()
        if not appt: raise HTTPException(status_code=404)
        
        # Clear out existing stages and bridge data so we can cleanly recreate based on modifying dose / package
        db.query(models.ApptStage).filter(models.ApptStage.appointment_id == appt.id).delete()
        db.query(models.AppointmentVaccine).filter(models.AppointmentVaccine.appointment_id == appt.id).delete()
        db.query(models.AppointmentBloodTest).filter(models.AppointmentBloodTest.appointment_id == appt.id).delete()
        
        doc_ic = booking.details.get('assigned_doctor_id')
        if not doc_ic or str(doc_ic).upper() in ["ANY", "NONE", "NULL"]: doc_ic = None
        appt.doctor_ic = doc_ic
        
        appt.general_notes = booking.details.get('reason') if booking.service_type in ['Others', 'Consultation'] else None
        
        service = booking.service_type
        items_list = booking.details.get('items', [])
        dose_val = str(booking.details.get('dose', 'Single Dose'))
        
        mapped_appt_type = 'single-visit'
        total_stages = 1
        start_dose_num = 1
        v_model = None
        
        if service == 'Vaccine':
            if items_list:
                v_model = db.query(models.Vaccine).filter_by(name=items_list[0]).first()
                if v_model:
                    total_stages = v_model.total_doses + (1 if v_model.has_booster else 0)
                    if dose_val.startswith("Dose "):
                        try: start_dose_num = int(dose_val.split(" ")[1])
                        except: pass
                    elif dose_val == "Booster":
                        start_dose_num = v_model.total_doses + 1
                        
                    # Re-evaluating type based on whether the chosen dose has follow up stages remaining.
                    if (total_stages - start_dose_num + 1) > 1:
                        mapped_appt_type = 'multi-stage'
                
        appt.appt_type = mapped_appt_type
        appt.total_stages = total_stages
        
        start_time = datetime.strptime(booking.scheduled_time, "%Y-%m-%d %H:%M:%S")
        
        if mapped_appt_type == 'multi-stage' and v_model:
            db.add(models.AppointmentVaccine(appointment_id=appt.id, vaccine_id=v_model.id, dose_number=dose_val))
            schedules = db.query(models.VaccineDoseSchedule).filter_by(vaccine_id=v_model.id).all()
            base_date = start_time
            current_calc_time = start_time
            prev_stage_id = None
            
            for i in range(start_dose_num, v_model.total_doses + 1):
                stage_name = f"Dose {i}"
                if i > start_dose_num:
                    sched = next((s for s in schedules if s.dose_number == i), None)
                    interval = sched.interval_description if sched else "1 month"
                    if not interval or not interval.strip():
                        continue 
                        
                    if "dose 1" in interval.lower():
                        current_calc_time = calculate_future_date(base_date, interval)
                    else:
                        current_calc_time = calculate_future_date(current_calc_time, interval)
                    
                if current_calc_time:
                    status_val = booking.status if i == start_dose_num else "scheduled"
                    stage = models.ApptStage(appointment_id=appt.id, stage_name=stage_name, scheduled_time=current_calc_time, depends_on_stage_id=prev_stage_id, status=status_val)
                    db.add(stage)
                    db.flush()
                    prev_stage_id = stage.id
                
            if v_model.has_booster and start_dose_num <= v_model.total_doses + 1:
                if start_dose_num == v_model.total_doses + 1:
                    current_calc_time = start_time
                else:
                    sched = next((s for s in schedules if s.dose_number == v_model.total_doses + 1), None)
                    interval = sched.interval_description if sched else "6 month"
                    if not interval or not interval.strip():
                        current_calc_time = None
                    else:
                        current_calc_time = calculate_future_date(current_calc_time, interval)
                    
                if current_calc_time:
                    status_val = booking.status if start_dose_num == v_model.total_doses + 1 else "scheduled"
                    stage = models.ApptStage(appointment_id=appt.id, stage_name="Booster", scheduled_time=current_calc_time, depends_on_stage_id=prev_stage_id, status=status_val)
                    db.add(stage)
                    db.flush()
        else:
            if service == 'Vaccine' and items_list and v_model:
                db.add(models.AppointmentVaccine(appointment_id=appt.id, vaccine_id=v_model.id, dose_number=dose_val))
            elif service == 'Blood Test' and items_list:
                for t_name in items_list:
                    bt = db.query(models.BloodTest).filter_by(name=t_name).first()
                    if bt: db.add(models.AppointmentBloodTest(appointment_id=appt.id, blood_test_id=bt.id))
                    
            new_stage = models.ApptStage(appointment_id=appt.id, stage_name=booking.details.get("dose", booking.service_type), scheduled_time=start_time, status=booking.status)
            db.add(new_stage)
            
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/cancel-appointment/{appt_id}")
def cancel_appointment(appt_id: str, db: Session = Depends(get_db)):
    db.query(models.ApptStage).filter(models.ApptStage.appointment_id == appt_id).update({"status": "canceled"})
    db.commit()
    return {"status": "success"}

@app.post("/login")
def user_login(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if user.password_hash != data.password:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    
    return {"status": "success", "user_ic": user.ic_passport_number, "role": user.role}

@app.post("/forgot-password")
def forgot_password(data: ForgotPasswordReq, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Email not found.")
    try:
        sender_email = "yourclinic.gmail@gmail.com"
        sender_password = "your-app-password"
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = user.email
        msg['Subject'] = "AICAS - Password Reset Code"
        body = "Your verification code is: 123456\n\nPlease use this to reset your password."
        msg.attach(MIMEText(body, 'plain'))
        return {"status": "success", "message": "Email sent (Simulation mode)."}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to send email configuration.")

@app.get("/admin/users/{ic}")
def get_user_details(ic: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter_by(ic_passport_number=ic).first()
    if not user: raise HTTPException(status_code=404)
    return {"email": user.email, "role": user.role}

@app.put("/admin/users/{ic}")
def update_user_details(ic: str, data: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(models.User).filter_by(ic_passport_number=ic).first()
    if not user: raise HTTPException(status_code=404)
    if data.email: user.email = data.email
    if data.role: user.role = data.role
    if data.password: user.password_hash = data.password
    db.commit()
    return {"status": "success"}

@app.get("/admin/doctors-all/{clinic_id}")
def get_all_doctors(clinic_id: str, db: Session = Depends(get_db)):
    doctors = db.query(models.Doctor).join(
        models.DoctorClinicAvailability, models.Doctor.ic_passport_number == models.DoctorClinicAvailability.doctor_ic
    ).filter(models.DoctorClinicAvailability.clinic_id == clinic_id).distinct().all()
    return doctors

@app.post("/admin/doctors")
def create_doctor(data: DoctorCreateReq, db: Session = Depends(get_db)):
    existing = db.query(models.Doctor).filter_by(ic_passport_number=data.ic).first()
    if not existing:
        new_doc = models.Doctor(ic_passport_number=data.ic, name=data.name.title(), gender=data.gender, specialization=data.specialization)
        db.add(new_doc)
    else:
        existing.name = data.name.title()
        existing.gender = data.gender
        existing.specialization = data.specialization
    db.commit()
    return {"status": "success"}

@app.put("/admin/doctors/{ic}")
def update_doctor(ic: str, data: DoctorCreateReq, db: Session = Depends(get_db)):
    doc = db.query(models.Doctor).filter_by(ic_passport_number=ic).first()
    if doc:
        doc.name = data.name.title()
        doc.gender = data.gender
        doc.specialization = data.specialization
        db.commit()
    return {"status": "success"}

@app.get("/admin/doctors/{ic}/availability/{clinic_id}")
def get_doc_availability(ic: str, clinic_id: str, db: Session = Depends(get_db)):
    avails = db.query(models.DoctorClinicAvailability).filter_by(doctor_ic=ic, clinic_id=clinic_id).all()
    return [{"day_of_week": a.day_of_week, "start_time": a.start_time.strftime("%H:%M"), "end_time": a.end_time.strftime("%H:%M")} for a in avails]

@app.post("/admin/doctors/{ic}/availability")
def add_doc_availability(ic: str, data: DoctorScheduleReq, db: Session = Depends(get_db)):
    st = datetime.strptime(data.start_time, "%H:%M").time()
    et = datetime.strptime(data.end_time, "%H:%M").time()
    avail = models.DoctorClinicAvailability(doctor_ic=ic, clinic_id=data.clinic_id, day_of_week=data.day_of_week, start_time=st, end_time=et)
    db.add(avail)
    db.commit()
    return {"status": "success"}

@app.delete("/admin/doctors/{ic}/availability/{clinic_id}/{day}/{start_time}")
def del_doc_availability(ic: str, clinic_id: str, day: str, start_time: str, db: Session = Depends(get_db)):
    st = datetime.strptime(start_time, "%H:%M").time()
    db.query(models.DoctorClinicAvailability).filter_by(doctor_ic=ic, clinic_id=clinic_id, day_of_week=day, start_time=st).delete()
    db.commit()
    return {"status": "success"}

@app.get("/admin/chat-history/{clinic_id}")
def get_chat_history(clinic_id: str, db: Session = Depends(get_db)):
    msgs = db.query(models.ChatMessage).filter_by(clinic_id=clinic_id).order_by(models.ChatMessage.created_at.desc()).all()
    return [{"telegram_id": m.telegram_id, "message": m.message, "reply": m.reply, "created_at": m.created_at} for m in msgs]