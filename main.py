import os
import httpx
import secrets
import string
from fastapi import FastAPI, Depends, HTTPException, Header
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
import jwt
import bcrypt
import uuid

# --- JWT Config ---
SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-aicas-key-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440 # 24 Hours

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        truncated_plain = plain_password.encode('utf-8')[:72]
        hash_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(truncated_plain, hash_bytes)
    except Exception as e:
        print(f"Bcrypt verify error: {e}")
        return False

def get_password_hash(password: str) -> str:
    truncated_password = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(truncated_password, salt)
    return hashed.decode('utf-8')

def generate_temp_password():
    alphabet = string.ascii_letters + string.digits
    pwd = ''.join(secrets.choice(alphabet) for i in range(8))
    return f"tmp_{pwd}"

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(authorization: str = Header(None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        ic = payload.get("sub")
        clinic_id = payload.get("clinic_id")
        
        if ic is None: raise HTTPException(status_code=401, detail="Invalid token payload")
        
        user = db.query(models.User).filter(models.User.ic_passport_number == ic).first()
        if user is None: raise HTTPException(status_code=401, detail="User not found")
        
        staff = db.query(models.ClinicStaff).filter_by(ic_passport_number=ic, clinic_id=clinic_id).first()
        if not staff and payload.get("role") != 'developer':
            raise HTTPException(status_code=403, detail="Account is not mapped to this clinic")
            
        if staff:
            user.role = staff.role
            user.clinic_id = staff.clinic_id
            user.permissions = staff.permissions
            user.status = staff.status
        else:
            user.role = 'developer'
            user.clinic_id = clinic_id
            user.status = 'active'
            user.permissions = 'ALL'

        if user.status != 'active': raise HTTPException(status_code=403, detail="Account is not active")
        return user
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token expired or invalid")

app = FastAPI(title="Clinic Smart Assistant Backend")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

# --- Pydantic Models ---
class CheckEmailReq(BaseModel):
    email: str

class LoginReq(BaseModel):
    email: str
    password: str
    clinic_id: str

class FirstLoginResetReq(BaseModel):
    email: str
    temp_password: str
    new_password: str
    clinic_id: str

class ForgotPasswordReq(BaseModel):
    email: str

class VerifyCodeReq(BaseModel):
    email: str
    code: str

class ResetPasswordReq(BaseModel):
    email: str
    code: str
    new_password: str

class ClinicRegistrationReq(BaseModel):
    clinic_name: str
    registration_number: Optional[str] = None
    address: Optional[str] = None
    contact_number: Optional[str] = None
    admin_ic: str
    admin_name: str
    admin_email: str
    admin_password: Optional[str] = None
    admin_status: Optional[str] = 'active'
    temp_admin_ic: Optional[str] = None
    temp_admin_name: Optional[str] = None
    temp_admin_email: Optional[str] = None
    temp_admin_password: Optional[str] = None
    temp_admin_status: Optional[str] = 'inactive'
    force_email_update: Optional[bool] = False

class UserCreateReq(BaseModel):
    clinic_id: str
    ic_passport_number: str
    name: str
    email: str
    permissions: str
    force_email_update: Optional[bool] = False
    
class UserUpdateReq(BaseModel):
    name: str
    email: str
    status: str
    permissions: str
    resign_reason: Optional[str] = None
    force_email_update: Optional[bool] = False
    
class UserSelfUpdateReq(BaseModel):
    name: str
    email: str
    password: Optional[str] = None

class DoctorCreateReq(BaseModel):
    clinic_id: str
    ic: str
    name: str
    gender: str
    specialization: Optional[str] = None
    status: Optional[str] = 'active'
    resign_reason: Optional[str] = None

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
    target_gender: Optional[str] = "ANY"

class VaccineAIRequest(BaseModel):
    search_query: str

class BloodTestCreate(BaseModel):
    clinic_id: str
    name: str
    description: Optional[str] = None 
    price: float
    test_type: str
    component_ids: Optional[List[int]] = [] 
    target_gender: Optional[str] = "ANY"

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
    cancel_reason: Optional[str] = None

class CancelReq(BaseModel):
    cancel_reason: str

class ChatMessageModel(BaseModel):
    clinic_id: str
    telegram_id: int
    message: str

class AdminReplyReq(BaseModel):
    msg_id: Optional[int] = None
    telegram_id: Optional[int] = None
    phone: Optional[str] = None
    clinic_id: str
    reply_text: str

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

# --- Helper Functions ---
def logging_agent(db: Session, clinic_id: str, action: str, reasoning: str):
    log = models.AgentLog(clinic_id=clinic_id, action=action, reasoning=reasoning)
    db.add(log)
    db.commit()

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

def safe_update_user_ic(db: Session, old_ic: str, new_ic: str):
    dependents = db.query(models.ClinicStaff).filter(models.ClinicStaff.assigned_by == old_ic).all()
    for dep in dependents:
        dep.assigned_by = None
    db.flush()
    
    db.query(models.VerificationCode).filter(models.VerificationCode.ic_passport_number == old_ic).delete(synchronize_session=False)
    db.flush()
    
    staff_records = db.query(models.ClinicStaff).filter(models.ClinicStaff.ic_passport_number == old_ic).all()
    staff_data = []
    for s in staff_records:
        staff_data.append({
            "clinic_id": s.clinic_id,
            "role": s.role,
            "status": s.status,
            "permissions": s.permissions,
            "assigned_by": s.assigned_by,
            "resign_reason": getattr(s, 'resign_reason', None),
            "created_at": s.created_at
        })
        db.delete(s)
    db.flush()
    
    db.execute(models.User.__table__.update().where(models.User.ic_passport_number == old_ic).values(ic_passport_number=new_ic))
    db.flush()
    
    for sd in staff_data:
        new_staff = models.ClinicStaff(
            ic_passport_number=new_ic,
            clinic_id=sd["clinic_id"],
            role=sd["role"],
            status=sd["status"],
            permissions=sd["permissions"],
            assigned_by=sd["assigned_by"],
            resign_reason=sd["resign_reason"],
            created_at=sd["created_at"]
        )
        db.add(new_staff)
    db.flush()
    
    for dep in dependents:
        dep.assigned_by = new_ic
    db.flush()

def check_and_update_user(db: Session, ic: str, name: str, email: str, force_email_update: bool):
    user = db.query(models.User).filter_by(ic_passport_number=ic).first()
    temp_pwd = None
    
    if user:
        if user.email != email:
            if not force_email_update:
                raise HTTPException(status_code=409, detail="EMAIL_MISMATCH")
            else:
                email_conflict = db.query(models.User).filter(models.User.email == email).first()
                if email_conflict and email_conflict.ic_passport_number != ic:
                    raise HTTPException(status_code=400, detail=f"Email {email} is already used by another account.")
                
                user.email = email
                temp_pwd = generate_temp_password()
                user.password_hash = get_password_hash(temp_pwd)
        user.name = name.upper()
    else:
        email_conflict = db.query(models.User).filter(models.User.email == email).first()
        if email_conflict:
            raise HTTPException(status_code=400, detail=f"Email {email} is already used by another account.")
        
        temp_pwd = generate_temp_password()
        user = models.User(
            ic_passport_number=ic, 
            name=name.upper(), 
            email=email, 
            password_hash=get_password_hash(temp_pwd)
        )
        db.add(user)
    return user, temp_pwd

# --- PUBLIC ENDPOINTS ---
@app.get("/clinics")
def get_public_clinics(db: Session = Depends(get_db)):
    clinics = db.query(models.Clinic).all()
    return [{"id": str(c.id), "name": c.name, "address": c.address, "contact_number": c.contact_number} for c in clinics]

@app.post("/admin/check-email")
def check_email_for_clinics(req: CheckEmailReq, db: Session = Depends(get_db)):
    if req.email == "developer@aicas.com":
        return [{"id": "dev", "name": "Developer Console"}]
        
    user = db.query(models.User).filter(models.User.email == req.email).first()
    if not user:
        return []
        
    staff_records = db.query(models.ClinicStaff).filter(models.ClinicStaff.ic_passport_number == user.ic_passport_number, models.ClinicStaff.status == 'active').all()
    clinic_ids = [s.clinic_id for s in staff_records]
    
    if not clinic_ids: return []
    
    clinics = db.query(models.Clinic).filter(models.Clinic.id.in_(clinic_ids)).all()
    return [{"id": str(c.id), "name": c.name} for c in clinics]

# --- SECURE ENDPOINTS ---
@app.post("/admin/login")
def admin_login(data: LoginReq, db: Session = Depends(get_db)):
    if data.email == 'developer@aicas.com' and data.password == 'aicasdev2026' and data.clinic_id == 'dev':
        return {
            "status": "success", 
            "token": "dev-token",
            "user": {
                "ic": "dev",
                "name": "AICAS Developer",
                "role": "developer",
                "permissions": "ALL",
                "clinic_id": "dev"
            }
        }

    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    staff = db.query(models.ClinicStaff).filter(models.ClinicStaff.ic_passport_number == user.ic_passport_number, models.ClinicStaff.clinic_id == data.clinic_id, models.ClinicStaff.status == 'active').first()
    
    if not staff:
        raise HTTPException(status_code=403, detail="Account is disabled or not mapped to this clinic")
        
    if data.password.startswith("tmp_") and (user.password_hash == data.password or verify_password(data.password, user.password_hash)):
        return {"status": "requires_reset", "email": data.email}
    
    if user.password_hash == data.password or verify_password(data.password, user.password_hash):
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.ic_passport_number, "role": staff.role, "clinic_id": str(staff.clinic_id)}, 
            expires_delta=access_token_expires
        )
        return {
            "status": "success", 
            "token": access_token,
            "user": {
                "ic": user.ic_passport_number,
                "name": user.name,
                "role": staff.role,
                "permissions": staff.permissions,
                "clinic_id": str(staff.clinic_id)
            }
        }
        
    raise HTTPException(status_code=401, detail="Invalid email or password")

@app.post("/admin/force-reset")
def force_password_reset(data: FirstLoginResetReq, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user: raise HTTPException(status_code=404, detail="User not found")
    
    staff = db.query(models.ClinicStaff).filter(models.ClinicStaff.ic_passport_number == user.ic_passport_number, models.ClinicStaff.status == 'active').first()
    if not staff: raise HTTPException(status_code=403, detail="Account is disabled")
    
    if user.password_hash == data.temp_password or verify_password(data.temp_password, user.password_hash):
        user.password_hash = get_password_hash(data.new_password)
        db.commit()
        
        if data.clinic_id == 'dev':
             return {
                "status": "success", 
                "token": "dev-token",
                "user": { "ic": "dev", "name": "AICAS Developer", "role": "developer", "permissions": "ALL", "clinic_id": "dev" }
            }
            
        staff = db.query(models.ClinicStaff).filter(models.ClinicStaff.ic_passport_number == user.ic_passport_number, models.ClinicStaff.clinic_id == data.clinic_id, models.ClinicStaff.status == 'active').first()
        if not staff: raise HTTPException(status_code=403, detail="Account is disabled or not mapped to this clinic")

        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.ic_passport_number, "role": staff.role, "clinic_id": str(staff.clinic_id)}, 
            expires_delta=access_token_expires
        )
        return {
            "status": "success", 
            "token": access_token,
            "user": {
                "ic": user.ic_passport_number,
                "name": user.name,
                "role": staff.role,
                "permissions": staff.permissions,
                "clinic_id": str(staff.clinic_id)
            }
        }
    raise HTTPException(status_code=401, detail="Invalid temporary password")

@app.post("/admin/forgot-password")
async def forgot_password(req: ForgotPasswordReq, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == req.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="This email is not registered.")
    
    code = ''.join(random.choices(string.digits, k=6))
    hashed_code = get_password_hash(code)
    
    db.query(models.VerificationCode).filter(
        models.VerificationCode.ic_passport_number == user.ic_passport_number,
        models.VerificationCode.used == False
    ).update({"used": True}, synchronize_session=False)
    
    v_code = models.VerificationCode(
        ic_passport_number=user.ic_passport_number,
        code_hash=hashed_code,
        expires_at=datetime.utcnow() + timedelta(minutes=15)
    )
    db.add(v_code)
    db.commit()

    sendgrid_api_key = os.getenv("SENDGRID_API_KEY")
    sendgrid_from_email = os.getenv("SENDGRID_FROM_EMAIL")
    
    if sendgrid_api_key and sendgrid_from_email:
        try:
            email_data = {
                "personalizations": [{
                    "to": [{"email": req.email}], 
                    "subject": "AICAS Password Reset Verification Code"
                }],
                "from": {"email": sendgrid_from_email, "name": "AICAS System"},
                "content": [{
                    "type": "text/plain", 
                    "value": f"Hello {user.name},\n\nYou requested to reset your password. Here is your 6-digit verification code:\n\n{code}\n\nThis code will expire in 15 minutes. If you did not request this, please ignore this email."
                }]
            }
            
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    "https://api.sendgrid.com/v3/mail/send",
                    headers={
                        "Authorization": f"Bearer {sendgrid_api_key}",
                        "Content-Type": "application/json"
                    },
                    json=email_data,
                    timeout=10.0
                )
                if res.status_code not in [200, 202, 204]:
                    print(f"Failed to send email via SendGrid: {res.text}")
        except Exception as e:
            print(f"Failed to send email via SendGrid: {e}")
    else:
        print("\n========== MOCK EMAIL VERIFICATION ==========")
        print(f"To: {req.email}")
        print(f"Code: {code}")
        print("=============================================\n")
        print("WARNING: SENDGRID_API_KEY or SENDGRID_FROM_EMAIL missing in .env. Fallback to terminal print.")
    
    return {"status": "success"}

@app.post("/admin/verify-code")
def verify_code(req: VerifyCodeReq, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == req.email).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid request.")
        
    v_code = db.query(models.VerificationCode).filter(
        models.VerificationCode.ic_passport_number == user.ic_passport_number,
        models.VerificationCode.used == False,
        models.VerificationCode.expires_at > datetime.utcnow()
    ).order_by(models.VerificationCode.created_at.desc()).first()
    
    if not v_code or not verify_password(req.code, v_code.code_hash):
        raise HTTPException(status_code=400, detail="Invalid or expired verification code.")
        
    return {"status": "success"}

@app.post("/admin/reset-password")
def reset_password(req: ResetPasswordReq, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == req.email).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid request.")
        
    v_code = db.query(models.VerificationCode).filter(
        models.VerificationCode.ic_passport_number == user.ic_passport_number,
        models.VerificationCode.used == False,
        models.VerificationCode.expires_at > datetime.utcnow()
    ).order_by(models.VerificationCode.created_at.desc()).first()
    
    if not v_code or not verify_password(req.code, v_code.code_hash):
        raise HTTPException(status_code=400, detail="Invalid or expired verification code.")
    
    user.password_hash = get_password_hash(req.new_password)
    v_code.used = True
    db.commit()
    return {"status": "success"}

@app.get("/admin/clinics")
def get_all_clinics(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != 'developer':
        raise HTTPException(status_code=403, detail="Not authorized")
    clinics = db.query(models.Clinic).all()
    res = []
    for c in clinics:
        admins = db.query(models.User, models.ClinicStaff).join(
            models.ClinicStaff, models.User.ic_passport_number == models.ClinicStaff.ic_passport_number
        ).filter(models.ClinicStaff.clinic_id == c.id).all()
        
        primary = next(((u, s) for u, s in admins if s.role == 'primary_admin'), None)
        temp = next(((u, s) for u, s in admins if s.role == 'temporary_admin'), None)
        res.append({
            "id": str(c.id),
            "name": c.name,
            "registration_number": c.registration_number,
            "address": c.address,
            "contact_number": c.contact_number,
            "admin": {
                "ic": primary[0].ic_passport_number,
                "name": primary[0].name,
                "email": primary[0].email,
                "status": primary[1].status
            } if primary else None,
            "temp_admin": {
                "ic": temp[0].ic_passport_number,
                "name": temp[0].name,
                "email": temp[0].email,
                "status": temp[1].status
            } if temp else None
        })
    return res

@app.post("/admin/register-clinic")
def register_clinic(data: ClinicRegistrationReq, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != 'developer':
        raise HTTPException(status_code=403, detail="Not authorized")

    try:
        p_user, admin_pwd = check_and_update_user(db, data.admin_ic, data.admin_name, data.admin_email, data.force_email_update)
        temp_admin_pwd = None
        
        new_clinic = models.Clinic(
            name=data.clinic_name,
            registration_number=data.registration_number,
            address=data.address,
            contact_number=data.contact_number
        )
        db.add(new_clinic)
        db.flush()
        
        p_staff = models.ClinicStaff(
            ic_passport_number=data.admin_ic,
            clinic_id=new_clinic.id,
            role='primary_admin',
            status='active',
            permissions='ALL'
        )
        db.add(p_staff)
        
        if data.temp_admin_ic and data.temp_admin_email:
            t_user, temp_admin_pwd = check_and_update_user(db, data.temp_admin_ic, data.temp_admin_name, data.temp_admin_email, data.force_email_update)
                
            t_staff = models.ClinicStaff(
                ic_passport_number=data.temp_admin_ic,
                clinic_id=new_clinic.id,
                role='temporary_admin',
                status='inactive',
                assigned_by=data.admin_ic,
                permissions='ALL'
            )
            db.add(t_staff)

        db.commit()
        return {
            "status": "success", 
            "clinic_id": str(new_clinic.id), 
            "message": "Clinic and Admin Accounts created.",
            "admin_pwd": admin_pwd,
            "temp_admin_pwd": temp_admin_pwd
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/admin/clinics/{clinic_id}")
def update_clinic(clinic_id: str, data: ClinicRegistrationReq, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != 'developer':
        raise HTTPException(status_code=403, detail="Not authorized")
    
    try:
        clinic = db.query(models.Clinic).filter(models.Clinic.id == clinic_id).first()
        if not clinic: raise HTTPException(status_code=404, detail="Clinic not found")
        
        clinic.name = data.clinic_name
        clinic.registration_number = data.registration_number
        clinic.address = data.address
        clinic.contact_number = data.contact_number

        admin_pwd = None
        temp_admin_pwd = None

        p_staff = db.query(models.ClinicStaff).filter_by(clinic_id=clinic_id, role='primary_admin').first()
        if p_staff:
            p_user = db.query(models.User).filter_by(ic_passport_number=p_staff.ic_passport_number).first()
            old_ic = p_user.ic_passport_number
            
            p_user_upd, p_temp_pwd = check_and_update_user(db, data.admin_ic, data.admin_name, data.admin_email, data.force_email_update)
            if p_temp_pwd: admin_pwd = p_temp_pwd
            
            if old_ic != data.admin_ic:
                p_staff.role = 'staff'
                p_staff.status = 'resigned'
                p_staff.permissions = None
                p_staff.resign_reason = "System Role Replacement"
                db.flush()
                
                new_p_staff = db.query(models.ClinicStaff).filter_by(clinic_id=clinic_id, ic_passport_number=data.admin_ic).first()
                if new_p_staff:
                    new_p_staff.role = 'primary_admin'
                    new_p_staff.status = data.admin_status or 'active'
                    new_p_staff.permissions = 'ALL'
                    new_p_staff.resign_reason = None
                else:
                    new_p_staff = models.ClinicStaff(ic_passport_number=data.admin_ic, clinic_id=clinic_id, role='primary_admin', status=data.admin_status or 'active', permissions='ALL')
                    db.add(new_p_staff)
            else:
                p_staff.status = data.admin_status or 'active'
        else:
            p_user_upd, p_temp_pwd = check_and_update_user(db, data.admin_ic, data.admin_name, data.admin_email, data.force_email_update)
            if p_temp_pwd: admin_pwd = p_temp_pwd
            new_p_staff = models.ClinicStaff(ic_passport_number=data.admin_ic, clinic_id=clinic_id, role='primary_admin', status=data.admin_status or 'active', permissions='ALL')
            db.add(new_p_staff)

        t_staff = db.query(models.ClinicStaff).filter_by(clinic_id=clinic_id, role='temporary_admin').first()
        if not data.temp_admin_ic:
            if t_staff:
                t_staff.role = 'staff'
                t_staff.status = 'resigned'
                t_staff.permissions = None
                t_staff.resign_reason = "System Role Replacement"
        else:
            t_user_upd, t_temp_pwd = check_and_update_user(db, data.temp_admin_ic, data.temp_admin_name, data.temp_admin_email, data.force_email_update)
            if t_temp_pwd: temp_admin_pwd = t_temp_pwd
            
            if t_staff:
                if t_staff.ic_passport_number != data.temp_admin_ic:
                    t_staff.role = 'staff'
                    t_staff.status = 'resigned'
                    t_staff.permissions = None
                    t_staff.resign_reason = "System Role Replacement"
                    db.flush()
                    
                    new_t_staff = db.query(models.ClinicStaff).filter_by(clinic_id=clinic_id, ic_passport_number=data.temp_admin_ic).first()
                    if new_t_staff:
                        new_t_staff.role = 'temporary_admin'
                        new_t_staff.status = data.temp_admin_status or 'inactive'
                        new_t_staff.permissions = 'ALL'
                        new_t_staff.resign_reason = None
                    else:
                        new_t_staff = models.ClinicStaff(ic_passport_number=data.temp_admin_ic, clinic_id=clinic_id, role='temporary_admin', status=data.temp_admin_status or 'inactive', assigned_by=data.admin_ic, permissions='ALL')
                        db.add(new_t_staff)
                else:
                    t_staff.status = data.temp_admin_status or 'inactive'
            else:
                new_t_staff = models.ClinicStaff(ic_passport_number=data.temp_admin_ic, clinic_id=clinic_id, role='temporary_admin', status=data.temp_admin_status or 'inactive', assigned_by=data.admin_ic, permissions='ALL')
                db.add(new_t_staff)

        db.commit()
        return {
            "status": "success",
            "admin_pwd": admin_pwd,
            "temp_admin_pwd": temp_admin_pwd
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/admin/clinics/{clinic_id}")
def delete_clinic(clinic_id: str, db: Session = Depends(get_db)):
    db.query(models.Clinic).filter(models.Clinic.id == clinic_id).delete()
    db.commit()
    return {"status": "success"}
    
@app.get("/admin/users")
def get_all_users(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role not in ['primary_admin', 'temporary_admin']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    staff = db.query(models.User, models.ClinicStaff).join(
        models.ClinicStaff, models.User.ic_passport_number == models.ClinicStaff.ic_passport_number
    ).filter(
        models.ClinicStaff.clinic_id == current_user.clinic_id,
        models.ClinicStaff.role != 'developer'
    ).all()
    
    return [{
        "ic": u.ic_passport_number,
        "name": u.name,
        "email": u.email,
        "role": s.role,
        "status": s.status,
        "permissions": s.permissions,
        "resign_reason": s.resign_reason,
        "created_at": s.created_at
    } for u, s in staff]

@app.post("/admin/users")
def create_user(data: UserCreateReq, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role not in ['primary_admin', 'temporary_admin']:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    user, temp_pwd = check_and_update_user(db, data.ic_passport_number, data.name, data.email, data.force_email_update)
        
    existing_staff = db.query(models.ClinicStaff).filter_by(ic_passport_number=data.ic_passport_number, clinic_id=current_user.clinic_id).first()
    if existing_staff:
        raise HTTPException(status_code=400, detail="User is already registered as staff in this clinic")
        
    new_staff = models.ClinicStaff(
        ic_passport_number=data.ic_passport_number,
        clinic_id=current_user.clinic_id,
        role='staff',
        status='active',
        assigned_by=current_user.ic_passport_number,
        permissions=data.permissions
    )
    db.add(new_staff)
    db.commit()
    return {"status": "success", "temp_password": temp_pwd, "message": "Password generated successfully." if temp_pwd else "Existing user successfully linked to clinic."}

@app.put("/admin/users/{ic}")
def update_user(ic: str, data: UserUpdateReq, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role not in ['primary_admin', 'temporary_admin']:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    staff = db.query(models.ClinicStaff).filter_by(ic_passport_number=ic, clinic_id=current_user.clinic_id).first()
    if not staff: raise HTTPException(status_code=404, detail="Staff record not found in this clinic")
    
    if staff.role in ['primary_admin', 'temporary_admin'] and current_user.ic_passport_number != ic:
        raise HTTPException(status_code=403, detail="Only Developers can modify primary/temporary admins from the Developer Console.")
        
    user, temp_pwd = check_and_update_user(db, ic, data.name, data.email, data.force_email_update)
    
    staff.status = data.status
    if data.status == 'resigned':
        staff.resign_reason = data.resign_reason
        staff.permissions = None 
    else:
        staff.resign_reason = None
        if staff.role in ['primary_admin', 'temporary_admin']:
            staff.permissions = 'ALL'
        else:
            staff.permissions = data.permissions
        
    db.commit()
    return {"status": "success", "temp_password": temp_pwd}
    
@app.put("/admin/profile")
def update_self_profile(data: UserSelfUpdateReq, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user = db.query(models.User).filter(models.User.ic_passport_number == current_user.ic_passport_number).first()
    user.name = data.name.upper()
    user.email = data.email
    if data.password:
        user.password_hash = get_password_hash(data.password)
    db.commit()
    return {"status": "success", "name": user.name}

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
                "color": color,
                "cancel_reason": stage.cancel_reason
            })
        return result
    except Exception as e:
        print(f"DASHBOARD CRASH PREVENTED: {e}")
        return []

@app.put("/admin/appointment-stages/{stage_id}")
def admin_update_stage(stage_id: str, data: dict, db: Session = Depends(get_db)):
    stage = db.query(models.ApptStage).filter_by(id=stage_id).first()
    if not stage: raise HTTPException(status_code=404)
    if 'status' in data: 
        stage.status = data['status']
        if data['status'] == 'canceled' and 'cancel_reason' in data:
            stage.cancel_reason = data['cancel_reason']
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
            if data.ic_passport_number and data.ic_passport_number.upper() != ic.upper():
                p.ic_passport_number = data.ic_passport_number.upper()
            p.name = data.name.upper()
            p.phone = data.phone
            p.gender = data.gender.upper()
            p.nationality = data.nationality.upper()
            p.address = data.address.upper() if data.address else None
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
            "target_gender": getattr(v, 'target_gender', 'ANY'),
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
            v = models.Vaccine(name=formatted_name, type=normalized_type, total_doses=data.total_doses, has_booster=data.has_booster, target_gender=data.target_gender.upper())
            db.add(v)
            db.flush() 
            v_id = v.id
            for sched in data.schedules:
                db.add(models.VaccineDoseSchedule(vaccine_id=v_id, dose_number=sched.get('dose_number'), interval_description=sched.get('interval_description')))
            db.flush() 
            
        elif v_id:
            v = db.query(models.Vaccine).filter_by(id=v_id).first()
            if v:
                v.name = formatted_name
                v.type = normalize_vaccine_type(db, data.type)
                v.total_doses = data.total_doses
                v.has_booster = data.has_booster
                v.target_gender = data.target_gender.upper()
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
            v.target_gender = data.target_gender.upper()
            
        vc = db.query(models.VaccineClinic).filter_by(vaccine_id=v_id, clinic_id=data.clinic_id).first()
        if vc: 
            vc.price = data.price
            vc.stock_quantity = data.stock_quantity
            vc.low_stock_threshold = data.low_stock_threshold

        db.query(models.VaccineDoseSchedule).filter_by(vaccine_id=v_id).delete()
        for sched in data.schedules:
            db.add(models.VaccineDoseSchedule(vaccine_id=v_id, dose_number=sched.get('dose_number'), interval_description=sched.get('interval_description')))

        db.flush()

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
                    
                if stage.status == "completed" or stage.scheduled_time < now:
                    prev_date = stage.scheduled_time
                    continue
                    
                if not interval:
                    continue
                    
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
        bt = models.BloodTest(clinic_id=data.clinic_id, name=data.name.title(), description=data.description, price=data.price, test_type=data.test_type, target_gender=data.target_gender.upper())
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
            bt.target_gender = data.target_gender.upper()
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
    patient = db.query(models.Patient).filter_by(telegram_id=msg.telegram_id).first()
    phone = patient.phone if patient else None
    new_msg = models.ChatMessage(
        clinic_id=msg.clinic_id, 
        telegram_id=msg.telegram_id, 
        phone=phone,
        channel='telegram',
        message=msg.message, 
        status="unread"
    )
    db.add(new_msg)
    db.commit()
    return {"status": "success"}

@app.get("/admin/chat-pending-count/{clinic_id}")
def get_pending_chat_count(clinic_id: str, db: Session = Depends(get_db)):
    count = db.query(models.ChatMessage).filter_by(clinic_id=clinic_id, status='unread').count()
    return {"count": count}

@app.post("/admin/chat-reply")
async def admin_chat_reply(req: AdminReplyReq, db: Session = Depends(get_db)):
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    bot_username = os.getenv("TELEGRAM_BOT_USERNAME", "AICAS_Clinic_Bot")
    
    target_telegram_id = req.telegram_id
    target_phone = req.phone
    channel = 'telegram'
    
    if req.msg_id:
        msg = db.query(models.ChatMessage).filter_by(id=req.msg_id).first()
        if not msg: raise HTTPException(status_code=404)
        msg.reply = req.reply_text
        msg.status = 'replied'
        target_telegram_id = msg.telegram_id
        target_phone = msg.phone
        channel = msg.channel or 'telegram'
    elif req.phone:
        patient = db.query(models.Patient).filter_by(phone=req.phone).first()
        if patient and patient.telegram_id:
            target_telegram_id = patient.telegram_id
            target_phone = patient.phone
            channel = 'telegram'
        else:
            channel = 'sms'
            target_phone = req.phone
            
        new_msg = models.ChatMessage(
            clinic_id=req.clinic_id, 
            telegram_id=target_telegram_id, 
            phone=target_phone,
            channel=channel,
            message="[Admin Initiated Chat]", 
            reply=req.reply_text, 
            status='replied'
        )
        db.add(new_msg)
        
        db.query(models.ChatMessage).filter_by(phone=target_phone, status='unread').update({"status": "replied"})

    db.commit()

    if channel == 'telegram' and token and target_telegram_id:
        async with httpx.AsyncClient() as client:
            try:
                await client.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json={"chat_id": target_telegram_id, "text": f"👨‍⚕️ *Clinic Admin:*\n{req.reply_text}", "parse_mode": "Markdown"}
                )
            except Exception as e:
                print(f"Failed to send telegram message: {e}")
    elif channel == 'sms' and target_phone:
        sms_content = (
            f"Clinic Admin: {req.reply_text}\n\n"
            f"Reply via SMS or use our Telegram Bot for a better experience: https://t.me/{bot_username}"
        )
        mocean_api_key = os.getenv("MOCEAN_API_KEY")
        mocean_api_secret = os.getenv("MOCEAN_API_SECRET")
        
        if mocean_api_key and mocean_api_secret:
            try:
                async with httpx.AsyncClient() as client:
                    await client.post(
                        "https://rest.moceanapi.com/rest/2/sms",
                        data={
                            "mocean-api-key": mocean_api_key,
                            "mocean-api-secret": mocean_api_secret,
                            "mocean-to": target_phone,
                            "mocean-from": "Clinic", 
                            "mocean-text": sms_content
                        }
                    )
                print(f"Mocean SMS Sent to {target_phone}")
            except Exception as e:
                print(f"Failed to send Mocean SMS: {e}")
        else:
            print("========== SMS DELIVERY ==========")
            print(f"TO: {target_phone}")
            print(f"MESSAGE:\n{sms_content}")
            print("==================================")
            print("WARNING: Mocean API keys missing. Fallback to print.")
                
    return {"status": "success", "channel": channel}

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

def get_doctors_and_slots_for_date(db: Session, clinic_id: str, date_obj: datetime.date, duration: int, doctor_pref: str):
    doc_query = db.query(models.Doctor).join(
        models.DoctorClinicAvailability, models.Doctor.ic_passport_number == models.DoctorClinicAvailability.doctor_ic
    ).filter(models.DoctorClinicAvailability.clinic_id == clinic_id)
    
    if doctor_pref:
        pref_upper = str(doctor_pref).upper()
        if pref_upper == "MALE": 
            doc_query = doc_query.filter(models.Doctor.gender.ilike("MALE"))
        elif pref_upper == "FEMALE": 
            doc_query = doc_query.filter(models.Doctor.gender.ilike("FEMALE"))
        elif pref_upper not in ["ANY", "NONE"]: 
            doc_query = doc_query.filter(models.Doctor.name.ilike(f"%{doctor_pref}%"))
            
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

@app.get("/admin/doctors-all/{clinic_id}")
def get_all_doctors(clinic_id: str, db: Session = Depends(get_db)):
    results = db.query(models.Doctor, models.DoctorClinicAvailability).join(
        models.DoctorClinicAvailability, models.Doctor.ic_passport_number == models.DoctorClinicAvailability.doctor_ic
    ).filter(models.DoctorClinicAvailability.clinic_id == clinic_id).all()
    
    doc_map = {}
    for doc, avail in results:
        if doc.ic_passport_number not in doc_map:
            computed_status = 'resigned' if avail.resign_reason else avail.status
            doc_map[doc.ic_passport_number] = {
                "ic_passport_number": doc.ic_passport_number,
                "name": doc.name,
                "gender": doc.gender,
                "specialization": doc.specialization,
                "status": computed_status,
                "resign_reason": avail.resign_reason
            }
    return list(doc_map.values())

@app.post("/admin/doctors")
def create_doctor(data: DoctorCreateReq, db: Session = Depends(get_db)):
    existing = db.query(models.Doctor).filter_by(ic_passport_number=data.ic).first()
    if not existing:
        new_doc = models.Doctor(
            ic_passport_number=data.ic, 
            name=data.name.upper(), 
            gender=data.gender, 
            specialization=data.specialization
        )
        db.add(new_doc)
        db.flush()
    else:
        existing.name = data.name.upper()
        existing.gender = data.gender
        existing.specialization = data.specialization
        db.flush()
        
    link = db.query(models.DoctorClinicAvailability).filter_by(doctor_ic=data.ic, clinic_id=data.clinic_id).first()
    if not link:
        db_status = 'inactive' if data.status == 'resigned' else (data.status or 'active')
        db_reason = data.resign_reason if data.status == 'resigned' else None
        
        dummy = models.DoctorClinicAvailability(
            doctor_ic=data.ic,
            clinic_id=data.clinic_id,
            day_of_week='none',
            start_time=datetime.strptime('00:00', '%H:%M').time(),
            end_time=datetime.strptime('00:00', '%H:%M').time(),
            status=db_status,
            resign_reason=db_reason
        )
        db.add(dummy)
        
    db.commit()
    return {"status": "success"}

@app.put("/admin/doctors/{ic}")
def update_doctor(ic: str, data: DoctorCreateReq, db: Session = Depends(get_db)):
    doc = db.query(models.Doctor).filter_by(ic_passport_number=ic).first()
    if doc:
        doc.name = data.name.upper()
        if data.ic and data.ic != ic:
            db.execute(models.Doctor.__table__.update().where(models.Doctor.ic_passport_number == ic).values(ic_passport_number=data.ic))
            ic = data.ic
        doc.gender = data.gender
        doc.specialization = data.specialization
        
        db_status = 'inactive' if data.status == 'resigned' else (data.status or 'active')
        db_reason = data.resign_reason if data.status == 'resigned' else None
        
        db.query(models.DoctorClinicAvailability).filter_by(doctor_ic=ic, clinic_id=data.clinic_id).update({
            "status": db_status,
            "resign_reason": db_reason
        })
        
        db.commit()
    return {"status": "success"}

@app.get("/admin/doctors/{ic}/availability/{clinic_id}")
def get_doc_availability(ic: str, clinic_id: str, db: Session = Depends(get_db)):
    avails = db.query(models.DoctorClinicAvailability).filter_by(doctor_ic=ic, clinic_id=clinic_id).all()
    return [{
        "day_of_week": a.day_of_week, 
        "start_time": a.start_time.strftime("%H:%M"), 
        "end_time": a.end_time.strftime("%H:%M")
    } for a in avails if a.day_of_week != 'none']

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

@app.post("/admin/doctors")
def create_doctor(data: DoctorCreateReq, db: Session = Depends(get_db)):
    existing = db.query(models.Doctor).filter_by(ic_passport_number=data.ic).first()
    if not existing:
        new_doc = models.Doctor(
            ic_passport_number=data.ic, 
            name=data.name.upper(), 
            gender=data.gender, 
            specialization=data.specialization,
            status=data.status or 'active',
            resign_reason=data.resign_reason
        )
        db.add(new_doc)
    else:
        existing.name = data.name.upper()
        existing.gender = data.gender
        existing.specialization = data.specialization
        existing.status = data.status or 'active'
        existing.resign_reason = data.resign_reason
        
    db.commit()
    return {"status": "success"}

@app.put("/admin/doctors/{ic}")
def update_doctor(ic: str, data: DoctorCreateReq, db: Session = Depends(get_db)):
    doc = db.query(models.Doctor).filter_by(ic_passport_number=ic).first()
    if doc:
        doc.name = data.name.upper()
        if data.ic and data.ic != ic:
            doc.ic_passport_number = data.ic
        doc.gender = data.gender
        doc.specialization = data.specialization
        doc.status = data.status or 'active'
        if doc.status == 'resigned':
            doc.resign_reason = data.resign_reason
        else:
            doc.resign_reason = None
        db.commit()
    return {"status": "success"}

@app.get("/admin/chat-history/{clinic_id}")
def get_chat_history(clinic_id: str, db: Session = Depends(get_db)):
    msgs = db.query(models.ChatMessage).filter_by(clinic_id=clinic_id).order_by(models.ChatMessage.created_at.asc()).all()
    res = []
    for m in msgs:
        phone = m.phone
        if not phone and m.telegram_id:
            patient = db.query(models.Patient).filter_by(telegram_id=m.telegram_id).first()
            phone = patient.phone if patient and patient.phone else f"Unknown ({m.telegram_id})"
        res.append({
            "id": m.id, 
            "telegram_id": m.telegram_id, 
            "phone": phone,
            "channel": m.channel or 'telegram',
            "message": m.message, 
            "reply": m.reply, 
            "created_at": m.created_at, 
            "status": m.status
        })
    return res