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

async def send_sms_async(to_phone: str, message: str):
    mocean_token = os.getenv("MOCEAN_API_TOKEN")
    plivo_auth_id = os.getenv("PLIVO_AUTH_ID")
    plivo_auth_token = os.getenv("PLIVO_AUTH_TOKEN")
    plivo_from = os.getenv("PLIVO_FROM_NUMBER", "AICAS")

    clean_phone = to_phone.replace("+", "")

    # 1. Try MoceanAPI (Main) using Bearer Token
    if mocean_token:
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    "https://rest.moceanapi.com/rest/2/sms",
                    headers={
                        "Authorization": f"Bearer {mocean_token}",
                        "Content-Type": "application/x-www-form-urlencoded"
                    },
                    data={
                        "mocean-to": clean_phone,
                        "mocean-from": "AICAS",
                        "mocean-text": message
                    },
                    timeout=5.0
                )
                if res.status_code == 200:
                    return True
        except Exception as e:
            print(f"MoceanAPI failed: {e}")

    # 2. Try Plivo (Backup)
    if plivo_auth_id and plivo_auth_token:
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    f"https://api.plivo.com/v1/Account/{plivo_auth_id}/Message/",
                    auth=(plivo_auth_id, plivo_auth_token),
                    json={"src": plivo_from, "dst": clean_phone, "text": message},
                    timeout=5.0
                )
                if res.status_code in [200, 202]:
                    return True
        except Exception as e:
            print(f"Plivo failed: {e}")
            
    return False

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

def send_temp_password_email_sync(email: str, temp_password: str, role_name: str):
    import httpx, os
    sendgrid_api_key = os.getenv("SENDGRID_API_KEY")
    sendgrid_from_email = os.getenv("SENDGRID_FROM_EMAIL")
    if sendgrid_api_key and sendgrid_from_email:
        try:
            email_data = {
                "personalizations": [{"to": [{"email": email}]}],
                "from": {"email": sendgrid_from_email, "name": "AICAS System"},
                "subject": f"AICAS {role_name} Account Details",
                "content": [{"type": "text/plain", "value": f"Your temporary password is: {temp_password}\nPlease login and reset your password immediately."}]
            }
            with httpx.Client() as client:
                res = client.post("https://api.sendgrid.com/v3/mail/send", headers={"Authorization": f"Bearer {sendgrid_api_key}", "Content-Type": "application/json"}, json=email_data, timeout=5.0)
                if res.status_code >= 400: print(f"SendGrid Error: {res.text}")
        except Exception as e:
            print(f"Failed to send temp password via SendGrid: {e}")
    else:
        print(f"\n========== MOCK TEMP PASSWORD EMAIL ==========\nTo: {email}\nRole: {role_name}\nPassword: {temp_password}\n=============================================\n")

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
        
        if clinic_id == "dev" and payload.get("role") == "developer":
            user.role = 'developer'
            user.clinic_id = 'dev'
            user.status = 'active'
            user.permissions = 'ALL'
            return user
            
        staff = db.query(models.ClinicStaff).filter_by(ic_passport_number=ic, clinic_id=clinic_id).first()
        if not staff:
            raise HTTPException(status_code=403, detail="Account is not mapped to this clinic")
            
        user.role = staff.role
        user.clinic_id = staff.clinic_id
        user.permissions = staff.permissions
        user.status = staff.status

        if user.status != 'active': raise HTTPException(status_code=403, detail="Account is not active")
        return user
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token expired or invalid")

app = FastAPI(title="Clinic Smart Assistant Backend")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

# --- Pydantic Models ---
class RequestEmailChangeReq(BaseModel):
    current_password: str
    new_email: str

class VerifyEmailChangeReq(BaseModel):
    new_email: str
    code: str

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
    allow_repeat_series: Optional[bool] = False
    repeat_interval_days: Optional[int] = None
    restart_if_interrupted: Optional[bool] = False
    interruption_restart_days: Optional[int] = None

class VaccineAIRequest(BaseModel):
    search_query: str

class AgentLogCreateReq(BaseModel):
    clinic_id: str
    action: str
    reasoning: str

class CancelNotifyReq(BaseModel):
    clinic_id: str
    stage_id: str
    cancel_reason: str
    total_cancelled: Optional[int] = 1

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
    skip_notification: Optional[bool] = False   # Add this line
    source: Optional[str] = "web"

class UpdateBooking(BaseModel):
    appt_id: str
    service_type: str
    details: Dict[str, Any]
    scheduled_time: str
    status: Optional[str] = "scheduled"
    cancel_reason: Optional[str] = None
    skip_notification: Optional[bool] = False
    source: Optional[str] = "web"

class CancelReq(BaseModel):
    cancel_reason: str
    skip_notification: Optional[bool] = False
    source: Optional[str] = "web"

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

class ChatTemplateCreate(BaseModel):
    clinic_id: str
    title: str
    message: str

class NewChatReq(BaseModel):
    clinic_id: str
    phone: str
    message: str

class PassToBotReq(BaseModel):
    clinic_id: str
    telegram_id: int

class ProfileUpdateReq(BaseModel):
    name: str
    email: str
    password: Optional[str] = None

class RecommendSlotReq(BaseModel):
    clinic_id: str
    base_date: str
    doctor_pref: str = 'ANY'
    duration: int = 30
    # New fields for Vaccine Agent integration
    service_type: Optional[str] = None
    vaccine_name: Optional[str] = None
    dose: Optional[str] = None
    ic: Optional[str] = None
    manual_dates: Optional[Dict[str, str]] = {}

class VaccineHistoryCheckReq(BaseModel):
    clinic_id: str
    ic: str
    vaccine_name: str
    target_dose: str

class ValidateVaccineDateReq(BaseModel):
    clinic_id: str
    ic: str
    vaccine_name: str
    target_dose: str
    requested_time: str
    manual_dates: Dict[str, str] = {}
    exclude_stage_id: Optional[str] = None 

# --- Helper Functions ---
def logging_agent(db: Session, clinic_id: str, action: str, reasoning: str):
    log = models.AgentLog(clinic_id=clinic_id, action=action, reasoning=reasoning)
    db.add(log)
    db.commit()

def normalize_vaccine_type(db: Session, given_type: str):
    if not given_type: return "Other"
    
    # 1. Remove any text inside brackets, including the brackets themselves e.g., "(Recombinant)"
    cleaned = re.sub(r'\([^)]*\)|\[[^]]*\]', '', given_type)
    
    # 2. Remove 'Inactivated', 'Activated', 'Vaccine' case-insensitively
    cleaned = re.sub(r'(?i)\b(inactivated|activated|vaccine)\b', '', cleaned)
    
    # 3. Clean up any extra spaces left behind from the removals
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    
    if not cleaned: return "Other"
    
    given_lower = cleaned.lower()
    existing_types = db.query(models.Vaccine.type).distinct().all()
    
    # 4. Exact Match Check (Ensures it groups into the same type without forcing partial matches)
    for (t,) in existing_types:
        if t and t.lower().strip() == given_lower:
            return t.title()
            
    # 5. If no exact match, treat it as a new type
    return cleaned.title()

def format_doctor_name(name: str) -> str:
    n = name.upper().strip()
    if not n.startswith("DR."):
        return f"DR. {n}"
    if n.startswith("DR.") and not n.startswith("DR. "):
        return f"DR. {n[3:].strip()}"
    return n

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
                hashed_pwd = get_password_hash(temp_pwd)
                user.password_hash = hashed_pwd
                db.add(models.VerificationCode(ic_passport_number=ic, code_hash=hashed_pwd, expires_at=datetime.utcnow() + timedelta(days=7)))
        user.name = name.upper()
        db.flush()
    else:
        email_conflict = db.query(models.User).filter(models.User.email == email).first()
        if email_conflict:
            raise HTTPException(status_code=400, detail=f"Email {email} is already used by another account.")
        
        temp_pwd = generate_temp_password()
        hashed_pwd = get_password_hash(temp_pwd)
        user = models.User(
            ic_passport_number=ic, 
            name=name.upper(), 
            email=email, 
            password_hash=hashed_pwd
        )
        db.add(user)
        db.flush()
        db.add(models.VerificationCode(ic_passport_number=ic, code_hash=hashed_pwd, expires_at=datetime.utcnow() + timedelta(days=7)))
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
        raise HTTPException(status_code=404, detail="No user found in the database. Please re-enter your email.")
        
    staff_records = db.query(models.ClinicStaff).filter(models.ClinicStaff.ic_passport_number == user.ic_passport_number, models.ClinicStaff.status == 'active').all()
    
    if not staff_records: 
        return [{"id": "dev", "name": "Developer Console"}]
        
    clinic_ids = [s.clinic_id for s in staff_records]
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
        raise HTTPException(status_code=404, detail="No user found in the database. Please re-enter your email.")
        
    if data.clinic_id == 'dev':
        staff_check = db.query(models.ClinicStaff).filter(models.ClinicStaff.ic_passport_number == user.ic_passport_number, models.ClinicStaff.status == 'active').first()
        if staff_check:
             raise HTTPException(status_code=403, detail="Account is mapped to a clinic, invalid developer login.")
             
        if data.password.startswith("tmp_") and (user.password_hash == data.password or verify_password(data.password, user.password_hash)):
            return {"status": "requires_reset", "email": data.email}
        
        if user.password_hash == data.password or verify_password(data.password, user.password_hash):
            access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
            access_token = create_access_token(
                data={"sub": user.ic_passport_number, "role": "developer", "clinic_id": "dev"}, 
                expires_delta=access_token_expires
            )
            return {
                "status": "success", 
                "token": access_token,
                "user": {
                    "ic": user.ic_passport_number,
                    "name": user.name,
                    "role": "developer",
                    "permissions": "ALL",
                    "clinic_id": "dev"
                }
            }
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
    
    if data.clinic_id == 'dev':
        staff_check = db.query(models.ClinicStaff).filter(models.ClinicStaff.ic_passport_number == user.ic_passport_number, models.ClinicStaff.status == 'active').first()
        if staff_check: raise HTTPException(status_code=403, detail="Account is mapped to a clinic, invalid developer login.")
        
        if user.password_hash == data.temp_password or verify_password(data.temp_password, user.password_hash):
            user.password_hash = get_password_hash(data.new_password)
            db.query(models.VerificationCode).filter(models.VerificationCode.ic_passport_number == user.ic_passport_number).delete()
            db.commit()
            access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
            access_token = create_access_token(
                data={"sub": user.ic_passport_number, "role": "developer", "clinic_id": "dev"}, 
                expires_delta=access_token_expires
            )
            return {
                "status": "success", 
                "token": access_token,
                "user": { "ic": user.ic_passport_number, "name": user.name, "role": "developer", "permissions": "ALL", "clinic_id": "dev" }
            }
        raise HTTPException(status_code=401, detail="Invalid temporary password")

    staff = db.query(models.ClinicStaff).filter(models.ClinicStaff.ic_passport_number == user.ic_passport_number, models.ClinicStaff.clinic_id == data.clinic_id, models.ClinicStaff.status == 'active').first()
    if not staff: raise HTTPException(status_code=403, detail="Account is disabled or not mapped to this clinic")
    
    if user.password_hash == data.temp_password or verify_password(data.temp_password, user.password_hash):
        user.password_hash = get_password_hash(data.new_password)
        db.query(models.VerificationCode).filter(models.VerificationCode.ic_passport_number == user.ic_passport_number).delete()
        db.commit()
        
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.ic_passport_number, "role": staff.role, "clinic_id": str(staff.clinic_id)}, 
            expires_delta=access_token_expires
        )
        return {
            "status": "success", 
            "token": access_token,
            "user": {"ic": user.ic_passport_number, "name": user.name, "role": staff.role, "permissions": staff.permissions, "clinic_id": str(staff.clinic_id)}
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
        admins = db.query(models.User, models.ClinicStaff).filter(
            models.User.ic_passport_number == models.ClinicStaff.ic_passport_number,
            models.ClinicStaff.clinic_id == c.id
        ).all()
        
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
    if current_user.role != 'developer': raise HTTPException(status_code=403, detail="Not authorized")
    try:
        p_user, admin_pwd = check_and_update_user(db, data.admin_ic, data.admin_name, data.admin_email, data.force_email_update)
        temp_admin_pwd = None
        new_clinic = models.Clinic(name=data.clinic_name, registration_number=data.registration_number, address=data.address, contact_number=data.contact_number)
        db.add(new_clinic)
        db.flush()
        
        p_staff = models.ClinicStaff(ic_passport_number=data.admin_ic, clinic_id=new_clinic.id, role='primary_admin', status='active', permissions='ALL')
        db.add(p_staff)
        
        if data.temp_admin_ic and data.temp_admin_email:
            t_user, temp_admin_pwd = check_and_update_user(db, data.temp_admin_ic, data.temp_admin_name, data.temp_admin_email, data.force_email_update)
            t_staff = models.ClinicStaff(ic_passport_number=data.temp_admin_ic, clinic_id=new_clinic.id, role='temporary_admin', status='inactive', assigned_by=data.admin_ic, permissions='ALL')
            db.add(t_staff)

        if admin_pwd: send_temp_password_email_sync(data.admin_email, admin_pwd, "Primary Admin")
        if temp_admin_pwd: send_temp_password_email_sync(data.temp_admin_email, temp_admin_pwd, "Temporary Admin")
            
        db.commit()
        return {"status": "success", "clinic_id": str(new_clinic.id), "message": "Clinic created. Verification emails sent."}
    except HTTPException: db.rollback(); raise
    except Exception as e: db.rollback(); raise HTTPException(status_code=400, detail=str(e))

@app.put("/admin/clinics/{clinic_id}")
def update_clinic(clinic_id: str, data: ClinicRegistrationReq, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != 'developer': raise HTTPException(status_code=403, detail="Not authorized")
    try:
        clinic = db.query(models.Clinic).filter(models.Clinic.id == clinic_id).first()
        if not clinic: raise HTTPException(status_code=404, detail="Clinic not found")
        clinic.name, clinic.registration_number, clinic.address, clinic.contact_number = data.clinic_name, data.registration_number, data.address, data.contact_number
        admin_pwd, temp_admin_pwd = None, None

        p_staff = db.query(models.ClinicStaff).filter_by(clinic_id=clinic_id, role='primary_admin').first()
        if p_staff:
            p_user = db.query(models.User).filter_by(ic_passport_number=p_staff.ic_passport_number).first()
            old_ic = p_user.ic_passport_number
            p_user_upd, p_temp_pwd = check_and_update_user(db, data.admin_ic, data.admin_name, data.admin_email, data.force_email_update)
            if p_temp_pwd: admin_pwd = p_temp_pwd
            if old_ic != data.admin_ic:
                p_staff.role, p_staff.status, p_staff.permissions, p_staff.resign_reason = 'staff', 'resigned', None, "System Role Replacement"
                db.flush()
                new_p_staff = db.query(models.ClinicStaff).filter_by(clinic_id=clinic_id, ic_passport_number=data.admin_ic).first()
                if new_p_staff: new_p_staff.role, new_p_staff.status, new_p_staff.permissions, new_p_staff.resign_reason = 'primary_admin', data.admin_status or 'active', 'ALL', None
                else: db.add(models.ClinicStaff(ic_passport_number=data.admin_ic, clinic_id=clinic_id, role='primary_admin', status=data.admin_status or 'active', permissions='ALL'))
            else: p_staff.status = data.admin_status or 'active'
        else:
            p_user_upd, p_temp_pwd = check_and_update_user(db, data.admin_ic, data.admin_name, data.admin_email, data.force_email_update)
            if p_temp_pwd: admin_pwd = p_temp_pwd
            db.add(models.ClinicStaff(ic_passport_number=data.admin_ic, clinic_id=clinic_id, role='primary_admin', status=data.admin_status or 'active', permissions='ALL'))

        t_staff = db.query(models.ClinicStaff).filter_by(clinic_id=clinic_id, role='temporary_admin').first()
        if not data.temp_admin_ic:
            if t_staff: t_staff.role, t_staff.status, t_staff.permissions, t_staff.resign_reason = 'staff', 'resigned', None, "System Role Replacement"
        else:
            t_user_upd, t_temp_pwd = check_and_update_user(db, data.temp_admin_ic, data.temp_admin_name, data.temp_admin_email, data.force_email_update)
            if t_temp_pwd: temp_admin_pwd = t_temp_pwd
            if t_staff:
                if t_staff.ic_passport_number != data.temp_admin_ic:
                    t_staff.role, t_staff.status, t_staff.permissions, t_staff.resign_reason = 'staff', 'resigned', None, "System Role Replacement"
                    db.flush()
                    new_t_staff = db.query(models.ClinicStaff).filter_by(clinic_id=clinic_id, ic_passport_number=data.temp_admin_ic).first()
                    if new_t_staff: new_t_staff.role, new_t_staff.status, new_t_staff.permissions, new_t_staff.resign_reason = 'temporary_admin', data.temp_admin_status or 'inactive', 'ALL', None
                    else: db.add(models.ClinicStaff(ic_passport_number=data.temp_admin_ic, clinic_id=clinic_id, role='temporary_admin', status=data.temp_admin_status or 'inactive', assigned_by=data.admin_ic, permissions='ALL'))
                else: t_staff.status = data.temp_admin_status or 'inactive'
            else:
                db.add(models.ClinicStaff(ic_passport_number=data.temp_admin_ic, clinic_id=clinic_id, role='temporary_admin', status=data.temp_admin_status or 'inactive', assigned_by=data.admin_ic, permissions='ALL'))

        if admin_pwd: send_temp_password_email_sync(data.admin_email, admin_pwd, "Primary Admin")
        if temp_admin_pwd: send_temp_password_email_sync(data.temp_admin_email, temp_admin_pwd, "Temporary Admin")

        db.commit()
        return {"status": "success"}
    except HTTPException: db.rollback(); raise
    except Exception as e: db.rollback(); raise HTTPException(status_code=400, detail=str(e))

@app.delete("/admin/clinics/{clinic_id}")
def delete_clinic(clinic_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role != 'developer':
        raise HTTPException(status_code=403, detail="Not authorized")
        
    # Find admins of this clinic before deleting it
    staff_records = db.query(models.ClinicStaff).filter(
        models.ClinicStaff.clinic_id == clinic_id,
        models.ClinicStaff.role.in_(['primary_admin', 'temporary_admin'])
    ).all()
    admin_ics = [s.ic_passport_number for s in staff_records]

    db.query(models.Clinic).filter(models.Clinic.id == clinic_id).delete()
    
    # Clean up their User table records if they aren't part of any other clinic
    for ic in admin_ics:
        other_staff = db.query(models.ClinicStaff).filter(models.ClinicStaff.ic_passport_number == ic).first()
        if not other_staff:
            db.query(models.User).filter(models.User.ic_passport_number == ic).delete()
            
    db.commit()
    return {"status": "success"}
    
@app.get("/admin/users")
def get_all_users(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role not in ['primary_admin', 'temporary_admin']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    staff = db.query(models.User, models.ClinicStaff).filter(
        models.User.ic_passport_number == models.ClinicStaff.ic_passport_number,
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
    if current_user.role not in ['primary_admin', 'temporary_admin']: raise HTTPException(status_code=403, detail="Not authorized")
    try:
        user, temp_pwd = check_and_update_user(db, data.ic_passport_number, data.name, data.email, data.force_email_update)
        existing_staff = db.query(models.ClinicStaff).filter_by(ic_passport_number=data.ic_passport_number, clinic_id=current_user.clinic_id).first()
        if existing_staff: raise HTTPException(status_code=400, detail="User is already registered as staff in this clinic")
        db.add(models.ClinicStaff(ic_passport_number=data.ic_passport_number, clinic_id=current_user.clinic_id, role='staff', status='active', assigned_by=current_user.ic_passport_number, permissions=data.permissions))
        if temp_pwd: send_temp_password_email_sync(data.email, temp_pwd, "Clinic Staff")
        db.commit()
        return {"status": "success", "message": "Password generated and sent via email successfully." if temp_pwd else "Existing user successfully linked to clinic."}
    except HTTPException: db.rollback(); raise
    except Exception as e: db.rollback(); raise HTTPException(status_code=400, detail=str(e))

@app.put("/admin/users/{ic}")
def update_user(ic: str, data: UserUpdateReq, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role not in ['primary_admin', 'temporary_admin']: raise HTTPException(status_code=403, detail="Not authorized")
    staff = db.query(models.ClinicStaff).filter_by(ic_passport_number=ic, clinic_id=current_user.clinic_id).first()
    if not staff: raise HTTPException(status_code=404, detail="Staff record not found in this clinic")
    if staff.role in ['primary_admin', 'temporary_admin'] and current_user.ic_passport_number != ic: raise HTTPException(status_code=403, detail="Only Developers can modify primary/temporary admins from the Developer Console.")
    try:
        user, temp_pwd = check_and_update_user(db, ic, data.name, data.email, data.force_email_update)
        staff.status = data.status
        if data.status == 'resigned':
            staff.resign_reason, staff.permissions = data.resign_reason, None
        else:
            staff.resign_reason = None
            staff.permissions = 'ALL' if staff.role in ['primary_admin', 'temporary_admin'] else data.permissions
        if temp_pwd: send_temp_password_email_sync(data.email, temp_pwd, "Clinic Staff")
        db.commit()
        return {"status": "success"}
    except HTTPException: db.rollback(); raise
    except Exception as e: db.rollback(); raise HTTPException(status_code=400, detail=str(e))
    
@app.get("/admin/profile")
def get_self_profile(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user = db.query(models.User).filter(models.User.ic_passport_number == current_user.ic_passport_number).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"name": user.name, "email": user.email}

@app.put("/admin/profile")
def update_self_profile(req: ProfileUpdateReq, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user = db.query(models.User).filter_by(ic_passport_number=current_user.ic_passport_number).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Updates name, and conditionally updates password if provided
    user.name = req.name.upper()
    if req.password:
        user.password_hash = get_password_hash(req.password)
        
    db.commit()
    return {"name": user.name, "email": user.email}

@app.get("/admin/inventory-alerts/{clinic_id}")
def get_inventory_alerts(clinic_id: str, db: Session = Depends(get_db)):
    alerts = []
    try:
        # Correctly queries the vaccine_clinic table and joins with vaccines to get the name
        low_stock_items = db.query(models.VaccineClinic, models.Vaccine).join(
            models.Vaccine, models.VaccineClinic.vaccine_id == models.Vaccine.id
        ).filter(
            models.VaccineClinic.clinic_id == clinic_id,
            models.VaccineClinic.stock_quantity <= models.VaccineClinic.low_stock_threshold
        ).all()

        for vc, v in low_stock_items:
            alerts.append({
                "name": v.name,
                "current_stock": vc.stock_quantity,
                "min_stock_level": vc.low_stock_threshold,
                "unit": "doses"
            })
    except Exception as e:
        print(f"Inventory Alert Error: {e}")
        
    return alerts

@app.post("/admin/request-email-change")
async def request_email_change(req: RequestEmailChangeReq, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    import random, string, httpx, os
    from datetime import datetime, timedelta
    
    try:
        # We lookup by the subject (which holds the IC/Passport) from the token directly
        user = db.query(models.User).filter_by(ic_passport_number=current_user.ic_passport_number).first()
        if not user or not verify_password(req.current_password, user.password_hash):
            raise HTTPException(status_code=401, detail="Incorrect current password.")
        
        conflict = db.query(models.User).filter(models.User.email == req.new_email).first()
        if conflict:
            raise HTTPException(status_code=400, detail="This email is already in use by another account.")
            
        code = ''.join(random.choices(string.digits, k=6))
        hashed_code = get_password_hash(code)
        
        old_codes = db.query(models.VerificationCode).filter_by(ic_passport_number=user.ic_passport_number, used=False).all()
        for oc in old_codes: oc.used = True
            
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
                # FIX: Moved 'subject' to the root to prevent SendGrid 400 Bad Request rejections
                email_data = {
                    "personalizations": [{"to": [{"email": req.new_email}]}],
                    "from": {"email": sendgrid_from_email, "name": "AICAS System"},
                    "subject": "AICAS Email Update Verification",
                    "content": [{"type": "text/plain", "value": f"Your verification code to update your email is: {code}\nThis code expires in 15 minutes."}]
                }
                async with httpx.AsyncClient() as client:
                    res = await client.post("https://api.sendgrid.com/v3/mail/send", headers={"Authorization": f"Bearer {sendgrid_api_key}", "Content-Type": "application/json"}, json=email_data)
                    if res.status_code >= 400:
                        print(f"SendGrid Error: {res.text}")
            except Exception as e:
                print(f"Failed to send email via SendGrid: {e}")
        else:
            print(f"\n========== MOCK EMAIL VERIFICATION ==========")
            print(f"To: {req.new_email}\nCode: {code}")
            print("=============================================\n")
            
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Email Change Error: {e}")
        raise HTTPException(status_code=400, detail="An internal server error occurred.")

@app.post("/admin/verify-email-change")
def verify_email_change(req: VerifyEmailChangeReq, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    from datetime import datetime
    try:
        user = db.query(models.User).filter_by(ic_passport_number=current_user.ic_passport_number).first()
        if not user: raise HTTPException(status_code=401, detail="User not found.")
        
        v_code = db.query(models.VerificationCode).filter(
            models.VerificationCode.ic_passport_number == user.ic_passport_number,
            models.VerificationCode.used == False,
            models.VerificationCode.expires_at > datetime.utcnow()
        ).order_by(models.VerificationCode.created_at.desc()).first()
        
        if not v_code or not verify_password(req.code, v_code.code_hash):
            raise HTTPException(status_code=400, detail="Invalid or expired verification code.")
            
        conflict = db.query(models.User).filter(models.User.email == req.new_email).first()
        if conflict: raise HTTPException(status_code=400, detail="This email is already in use by another account.")
        
        user.email = req.new_email
        v_code.used = True
        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Verify Error: {e}")
        raise HTTPException(status_code=400, detail="Verification failed.")
    
@app.get("/admin/appointments/{clinic_id}")
def admin_get_all_appointments(clinic_id: str, db: Session = Depends(get_db)):
    try:
        appointments = db.query(models.Appointment).join(models.Patient, models.Appointment.patient_id == models.Patient.id).filter(models.Patient.clinic_id == clinic_id).all()
        appt_ids = [a.id for a in appointments]
        if not appt_ids: return []
        
        stages = db.query(models.ApptStage).filter(models.ApptStage.appointment_id.in_(appt_ids)).all()
        appt_dict = {str(a.id): a for a in appointments}
        
        patient_ids = list({a.patient_id for a in appointments if a.patient_id})
        patients = db.query(models.Patient).filter(models.Patient.id.in_(patient_ids)).all() if patient_ids else []
        patient_dict = {str(p.id): p for p in patients}
        
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
            
            patient = patient_dict.get(str(appt.patient_id))
            doctor = doctor_dict.get(str(appt.doctor_ic)) if appt.doctor_ic else None

            key = str(appt.id)
            items_list = []
            dose_val = stage.stage_name
            total_doses = appt.total_stages

            # --- CHANGE THIS LINE ---
            service = "Others" 
            # -----------------------
            color = "#3B82F6" 

            if key in vac_dict:
                service = "Vaccine"
                color = "#A855F7"
                for av in vac_dict[key]:
                    v_name = v_name_map.get(av.vaccine_id, "Unknown Vaccine")
                    items_list.append(v_name)
                    dose_val = stage.stage_name.title() if stage.stage_name else av.dose_number
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
    
    original_status = stage.status
    
    if 'status' in data:
        new_status = data['status']
        stage.status = new_status
        if new_status in ('canceled', 'no-show') and 'cancel_reason' in data:
            stage.cancel_reason = data['cancel_reason']

        # Auto-cascade cancel all future doses when a dose is marked no-show
        if new_status == 'no-show':
            appt_for_cascade = db.query(models.Appointment).filter_by(id=stage.appointment_id).first()
            if appt_for_cascade and appt_for_cascade.appt_type == 'multi-stage':
                # Determine numeric position of this stage
                def _dose_num(n: str) -> int:
                    if not n: return 0
                    nl = n.lower().strip()
                    if 'single' in nl: return 1
                    if 'booster' in nl: return 9999
                    import re as _re
                    m = _re.match(r'dose\s+(\d+)', nl)
                    return int(m.group(1)) if m else 0

                this_num = _dose_num(stage.stage_name or '')
                if this_num > 0:
                    future_stages = db.query(models.ApptStage).filter(
                        models.ApptStage.appointment_id == stage.appointment_id,
                        models.ApptStage.id != stage.id,
                        models.ApptStage.status == 'scheduled'
                    ).all()
                    for fs in future_stages:
                        if _dose_num(fs.stage_name or '') > this_num:
                            fs.status = 'canceled'
                            fs.cancel_reason = f'Auto-cancelled: {stage.stage_name} was marked as No-Show'
            
    if 'scheduled_time' in data:
        dt_str = data['scheduled_time'].replace("T", " ")
        if len(dt_str) == 16: dt_str += ":00"
        stage.scheduled_time = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
        
    if 'doctor_ic' in data:
        appt = db.query(models.Appointment).filter_by(id=stage.appointment_id).first()
        if appt:
            doc_val = data['doctor_ic']
            # FIX: Safely handle "ANY" or empty assignments to prevent Foreign Key crashes
            if not doc_val or str(doc_val).upper() in ["ANY", "NONE", "NULL", ""]:
                appt.doctor_ic = None
            else:
                appt.doctor_ic = doc_val

    if data.get('status') == 'completed' and original_status != 'completed':
        # Check if it's a vaccine that needs stock deduction
        if stage.stage_name in ['Dose 1', 'Single Dose']:
            appt_vac = db.query(models.AppointmentVaccine).filter_by(appointment_id=stage.appointment_id).first()
            if appt_vac:
                vc = db.query(models.VaccineClinic).join(models.Patient, models.Patient.clinic_id == models.VaccineClinic.clinic_id).join(models.Appointment, models.Appointment.patient_id == models.Patient.id).filter(models.Appointment.id == stage.appointment_id, models.VaccineClinic.vaccine_id == appt_vac.vaccine_id).first()
                if vc and vc.stock_quantity > 0:
                    vc.stock_quantity -= 1

    db.commit()
    return {"status": "success"}

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
    
    if req.doctor_pref and req.doctor_pref.upper() not in ["ANY", "NONE", "MALE", "FEMALE"]:
        matched_docs = db.query(models.Doctor).join(
            models.DoctorClinicAvailability, models.Doctor.ic_passport_number == models.DoctorClinicAvailability.doctor_ic
        ).filter(
            models.DoctorClinicAvailability.clinic_id == req.clinic_id,
            models.Doctor.name.ilike(f"%{req.doctor_pref}%")
        ).distinct().all()
        
        if len(matched_docs) == 0:
            return {"is_valid": False, "reason": f"No doctor matching '{req.doctor_pref}' was found in the system.", "suggestions": []}
        elif len(matched_docs) > 1:
            exact_match = [d for d in matched_docs if d.name.upper() == req.doctor_pref.upper()]
            if len(exact_match) == 1:
                req.doctor_pref = exact_match[0].name
            else:
                names = ", ".join([d.name for d in matched_docs])
                return {"is_valid": False, "reason": f"Multiple doctors match '{req.doctor_pref}': {names}. Please clarify your preference.", "suggestions": []}
        else:
            req.doctor_pref = matched_docs[0].name

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
        best_doc = None
        min_workload = float('inf')
        
        # FIX: Load balancing assignment based on lowest workload (deterministic, NO random.choice)
        for ds in available_docs_for_this_slot:
            doc = ds['doc']
            count = db.query(models.ApptStage).join(models.Appointment).filter(
                models.Appointment.doctor_ic == doc.ic_passport_number,
                models.ApptStage.status == 'scheduled',
                models.ApptStage.scheduled_time >= now
            ).count()
            
            if count < min_workload or (count == min_workload and (best_doc is None or doc.ic_passport_number < best_doc.ic_passport_number)):
                min_workload = count
                best_doc = doc
                
        return {"is_valid": True, "reason": "Slot available.", "doctor_id": str(best_doc.ic_passport_number), "doctor_name": best_doc.name, "suggestions": []}
    else:
        date_has_slots = any(len(ds['slots']) > 0 for doc in doc_slots for ds in [doc])
        if date_has_slots:
            reason = f"Date {date_obj.strftime('%Y-%m-%d')} is available, but the selected time {req_dt.strftime('%H:%M')} is unavailable."
        else:
            reason = f"The specific date and time selected ({req_dt.strftime('%Y-%m-%d %H:%M')}) is unavailable."
        return {"is_valid": False, "reason": reason, "suggestions": find_nearest_3_slots(date_obj)}
    
@app.post("/book-appointment")
async def book_appointment(booking: Booking, db: Session = Depends(get_db)):
    try:
        patient = db.query(models.Patient).filter(models.Patient.ic_passport_number == booking.ic_passport_number, models.Patient.clinic_id == booking.clinic_id).first()
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

        # Check if this is a subsequent dose and we need to append to an existing appointment
        existing_appt_id = None
        prev_stage_id = None
        doc_ic = booking.details.get('assigned_doctor_id')
        if not doc_ic or str(doc_ic).upper() in ["ANY", "NONE", "NULL"]: doc_ic = None
        
        if booking.service_type == 'Vaccine' and v_model and start_dose_num > 1:
            same_type_ids = [v.id for v in db.query(models.Vaccine.id).filter(models.Vaccine.type == v_model.type).all()]
            prev_dose_name = f"Dose {start_dose_num - 1}" if start_dose_num <= v_model.total_doses else (f"Dose {v_model.total_doses}" if v_model.total_doses > 1 else "Single Dose")
            
            # UPGRADED: Explicit select_from to prevent SQLAlchemy Join crashes
            prev_stage = db.query(models.ApptStage)\
                .select_from(models.ApptStage)\
                .join(models.Appointment, models.ApptStage.appointment_id == models.Appointment.id)\
                .join(models.AppointmentVaccine, models.Appointment.id == models.AppointmentVaccine.appointment_id)\
                .filter(
                    models.Appointment.patient_id == patient.id,
                    models.AppointmentVaccine.vaccine_id.in_(same_type_ids),
                    models.ApptStage.stage_name == prev_dose_name,
                    models.ApptStage.status.notin_(['canceled', 'no-show'])
                ).order_by(models.ApptStage.scheduled_time.desc()).first()
            
            if prev_stage:
                existing_appt_id = prev_stage.appointment_id
                prev_stage_id = prev_stage.id
                
        if existing_appt_id:
            # Re-use existing appointment parent
            new_appt = db.query(models.Appointment).filter_by(id=existing_appt_id).first()
            new_appt.appt_type = 'multi-stage'
            new_appt.total_stages = max(new_appt.total_stages, start_dose_num)
            db.flush()
        else:
            # Create brand new parent
            new_appt = models.Appointment(
                patient_id=patient.id, 
                clinic_id=booking.clinic_id, # <--- NEW: Synchronized with DB
                doctor_ic=doc_ic, 
                appt_type=mapped_appt_type, 
                total_stages=total_stages, 
                general_notes=booking.details.get('general_notes')  
            )
            db.add(new_appt)
            db.flush()
            
            # Only create junction row if it's a completely new appointment parent
            # NOTE: Blood Test junction rows are handled further below with a
            # duplicate-existence check, preventing UniqueViolation errors
            # when autoflush=False is in effect on the session.
            if booking.service_type == 'Vaccine' and items_list and v_model:
                db.add(models.AppointmentVaccine(appointment_id=new_appt.id, vaccine_id=v_model.id, dose_number=dose_val))
        
        start_time = datetime.strptime(booking.scheduled_time, "%Y-%m-%d %H:%M:%S")
        
        if mapped_appt_type == 'multi-stage' and v_model:
            schedules = db.query(models.VaccineDoseSchedule).filter_by(vaccine_id=v_model.id).all()
            current_calc_time = start_time
            
            for i in range(start_dose_num, v_model.total_doses + 1):
                stage_name = f"Dose {i}"
                if i > start_dose_num:
                    sched = next((s for s in schedules if s.dose_number == i), None)
                    interval_days = sched.interval_days if sched and sched.interval_days is not None else 30
                    current_calc_time = current_calc_time + timedelta(days=interval_days)
                    
                if current_calc_time:
                    # --- SCHEDULING AGENT: Find nearest valid slot for assigned doctor ---
                    assigned_doc_ic = new_appt.doctor_ic
                    target_dt = current_calc_time.date()
                    found_slot = False
                    for offset in range(60):  # scan up to 60 days
                        search_dt = target_dt + timedelta(days=offset)
                        day_str = search_dt.strftime("%a").lower()

                        # Check the SPECIFIC doctor's schedule first, fall back to any doctor
                        if assigned_doc_ic:
                            oh = db.query(models.DoctorClinicAvailability).filter(
                                models.DoctorClinicAvailability.clinic_id == new_appt.clinic_id,
                                models.DoctorClinicAvailability.doctor_ic == assigned_doc_ic,
                                models.DoctorClinicAvailability.day_of_week == day_str,
                                models.DoctorClinicAvailability.status == 'active'
                            ).first()
                        else:
                            oh = db.query(models.DoctorClinicAvailability).filter(
                                models.DoctorClinicAvailability.clinic_id == new_appt.clinic_id,
                                models.DoctorClinicAvailability.day_of_week == day_str,
                                models.DoctorClinicAvailability.status == 'active'
                            ).first()

                        if oh and oh.day_of_week != 'none':
                            try:
                                candidate_time = datetime.combine(search_dt, oh.start_time)
                                # Verify no scheduling conflict for this doctor at this time
                                check_ic = assigned_doc_ic or oh.doctor_ic
                                conflict = db.query(models.ApptStage).join(models.Appointment).filter(
                                    models.Appointment.doctor_ic == check_ic,
                                    models.ApptStage.scheduled_time == candidate_time,
                                    models.ApptStage.status == 'scheduled'
                                ).first() if check_ic else None
                                if not conflict:
                                    current_calc_time = candidate_time
                                    found_slot = True
                                    break
                            except Exception:
                                pass
                    # If no open slot found in 60 days, keep the calculated time as fallback
                            
                    stage = models.ApptStage(
                        appointment_id=new_appt.id, stage_name=stage_name, 
                        scheduled_time=current_calc_time, depends_on_stage_id=prev_stage_id, status="scheduled"
                    )
                    db.add(stage)
                    db.flush()
                    prev_stage_id = stage.id
                
            if v_model.has_booster and start_dose_num <= v_model.total_doses + 1:
                if start_dose_num == v_model.total_doses + 1:
                    current_calc_time = start_time
                else:
                    sched = next((s for s in schedules if s.dose_number == v_model.total_doses + 1), None)
                    interval_days = sched.interval_days if sched and sched.interval_days is not None else 180
                    current_calc_time = current_calc_time + timedelta(days=interval_days)
                    
                if current_calc_time:
                    # --- SCHEDULING AGENT: Find nearest valid slot for assigned doctor ---
                    assigned_doc_ic = new_appt.doctor_ic
                    target_dt = current_calc_time.date()
                    found_slot = False
                    for offset in range(60):  # scan up to 60 days
                        search_dt = target_dt + timedelta(days=offset)
                        day_str = search_dt.strftime("%a").lower()

                        # Check the SPECIFIC doctor's schedule first, fall back to any doctor
                        if assigned_doc_ic:
                            oh = db.query(models.DoctorClinicAvailability).filter(
                                models.DoctorClinicAvailability.clinic_id == new_appt.clinic_id,
                                models.DoctorClinicAvailability.doctor_ic == assigned_doc_ic,
                                models.DoctorClinicAvailability.day_of_week == day_str,
                                models.DoctorClinicAvailability.status == 'active'
                            ).first()
                        else:
                            oh = db.query(models.DoctorClinicAvailability).filter(
                                models.DoctorClinicAvailability.clinic_id == new_appt.clinic_id,
                                models.DoctorClinicAvailability.day_of_week == day_str,
                                models.DoctorClinicAvailability.status == 'active'
                            ).first()

                        if oh and oh.day_of_week != 'none':
                            try:
                                candidate_time = datetime.combine(search_dt, oh.start_time)
                                # Verify no scheduling conflict for this doctor at this time
                                check_ic = assigned_doc_ic or oh.doctor_ic
                                conflict = db.query(models.ApptStage).join(models.Appointment).filter(
                                    models.Appointment.doctor_ic == check_ic,
                                    models.ApptStage.scheduled_time == candidate_time,
                                    models.ApptStage.status == 'scheduled'
                                ).first() if check_ic else None
                                if not conflict:
                                    current_calc_time = candidate_time
                                    found_slot = True
                                    break
                            except Exception:
                                pass
                    # If no open slot found in 60 days, keep the calculated time as fallback
        else:
            # Strictly determine the stage name based on the service type
            final_stage_name = booking.service_type
            if booking.service_type in ['Others', 'Consultation', 'General Appointment', 'General']:
                final_stage_name = 'Others'
            elif booking.service_type == 'Blood Test':
                final_stage_name = 'Blood Test'
            elif booking.service_type == 'Vaccine':
                final_stage_name = booking.details.get("dose", "Single Dose")

            if booking.service_type == 'Vaccine' and items_list and v_model:
                # Check if AppointmentVaccine already exists to avoid duplicate key violation
                existing_av = db.query(models.AppointmentVaccine).filter_by(
                    appointment_id=new_appt.id, vaccine_id=v_model.id
                ).first()
                if not existing_av:
                    db.add(models.AppointmentVaccine(appointment_id=new_appt.id, vaccine_id=v_model.id, dose_number=dose_val))
            elif booking.service_type == 'Blood Test' and items_list:
                # Check and add only missing BloodTest records
                for t_name in items_list:
                    bt = db.query(models.BloodTest).filter_by(name=t_name).first()
                    if bt:
                        existing_abt = db.query(models.AppointmentBloodTest).filter_by(
                            appointment_id=new_appt.id, blood_test_id=bt.id
                        ).first()
                        if not existing_abt:
                            db.add(models.AppointmentBloodTest(appointment_id=new_appt.id, blood_test_id=bt.id))
            
            stage = models.ApptStage(
                appointment_id=new_appt.id, 
                stage_name=final_stage_name, 
                scheduled_time=start_time, 
                status="scheduled"
            )
            db.add(stage)
        # --- NEW: Save any manually provided external dates ---
        manual_dates = booking.details.get('manual_dates', {})
        if manual_dates and booking.service_type == 'Vaccine' and v_model:
            for d_name, d_date in manual_dates.items():
                exists = db.query(models.ExternalVaccineRecord).filter_by(
                    patient_ic=patient.ic_passport_number,
                    vaccine_id=v_model.id,
                    dose_name=d_name
                ).first()
                if not exists:
                    try:
                        ext_rec = models.ExternalVaccineRecord(
                            patient_ic=patient.ic_passport_number,
                            vaccine_id=v_model.id,
                            dose_name=d_name,
                            date_taken=datetime.strptime(d_date, "%Y-%m-%d")
                        )
                        db.add(ext_rec)
                    except: pass
        db.commit()

        # Extract the dynamically generated stages and ensure Booster is strictly at the bottom
        stages_query = db.query(models.ApptStage).filter_by(appointment_id=new_appt.id).order_by(models.ApptStage.scheduled_time.asc()).all()
        
        stages_data = []
        booster_data = None
        
        for s in stages_query:
            stage_info = {
                "stage_name": s.stage_name, 
                "date": s.scheduled_time.strftime('%Y-%m-%d'), 
                "time": s.scheduled_time.strftime('%H:%M')
            }
            # Identify the booster and hold it back
            if s.stage_name.lower() == "booster":
                booster_data = stage_info
            else:
                stages_data.append(stage_info)
                
        # Append the Booster appointment as the final item
        if booster_data:
            stages_data.append(booster_data)

        # Send Booking Summary ONLY if requested from the React Website
        # Checking 'not booking.skip_notification' completely stops Telegram Bot triggers
        if getattr(booking, 'source', 'web') == 'web' and not booking.skip_notification:
            try:
                details_dict = booking.details
                
                # Fetch actual doctor name from DB to prevent "ANY", "MALE", "FEMALE"
                doc_ic = details_dict.get('assigned_doctor_id')
                actual_doc_name = "ANY"
                if doc_ic and str(doc_ic).upper() not in ["ANY", "NONE", "NULL", ""]:
                    doc_model = db.query(models.Doctor).filter_by(ic_passport_number=doc_ic).first()
                    if doc_model:
                        actual_doc_name = doc_model.name
                
                items = details_dict.get('items', [])
                dose = details_dict.get('dose')
                notes = details_dict.get('general_notes')
                doctor_str = f"\nDoctor: {actual_doc_name}"
                
                if booking.service_type == 'Vaccine':
                    details_str = f"{items[0] if items else ''} ({dose})" if dose else ", ".join(items)
                    
                    # Dynamically build the generated schedule block
                    sched_str = "Your vaccination schedule has been created successfully.\n\nUpcoming Appointments:\n"
                    for s in stages_data:
                        sched_str += f"{s['stage_name']}\nDate: {s['date']}\nTime: {s['time']}\n\n"
                    sched_str += "Don't worry, we will send you a reminder before each appointment."
                    
                    summary = (f"✅ Booking Successfully Confirmed!\n\n"
                               f"Name: {patient.name}\n"
                               f"IC/Passport: {patient.ic_passport_number}\n"
                               f"Phone: {patient.phone}\n"
                               f"Service: {booking.service_type}\n"
                               f"Details: {details_str}{doctor_str}\n\n"
                               f"{sched_str}")
                else:
                    if booking.service_type == 'Blood Test':
                        details_str = ", ".join(items) if items else ""
                    else:
                        details_str = str(notes) if notes else "General Consultation"
                        
                    summary = (f"✅ Booking Successfully Confirmed!\n\n"
                               f"Name: {patient.name}\n"
                               f"IC/Passport: {patient.ic_passport_number}\n"
                               f"Phone: {patient.phone}\n"
                               f"Date: {start_time.strftime('%Y-%m-%d')}\n"
                               f"Time: {start_time.strftime('%H:%M')}\n"
                               f"Service: {booking.service_type}\n"
                               f"Details: {details_str}{doctor_str}")
                               
                if booking.service_type == "Blood Test":
                    summary += "\n\n⚠️ Reminder: Kindly ensure that you fast for at least 9 hours before your blood test. You are advised not to consume any food or drinks except plain water during the fasting period."
                
                bot_username = os.getenv("BOT_USERNAME", "aicas_clinic_bot")
                
                if patient.telegram_id:
                    summary += "\n\nIf there is any modification needed, just type /start and choose 2. Check Appointment Details."
                    token = os.getenv("TELEGRAM_BOT_TOKEN")
                    async with httpx.AsyncClient() as client:
                        await client.post(f"https://api.telegram.org/bot{token}/sendMessage", json={
                            "chat_id": patient.telegram_id, 
                            "text": summary
                        })
                        
                    # Save notification to Chat_Messages table
                    db.add(models.ChatMessage(clinic_id=booking.clinic_id, phone=patient.phone, telegram_id=patient.telegram_id, channel='telegram', message=None, reply=summary, status='replied'))
                    db.commit()
                else:
                    summary += f"\n\nIf there is any modification needed, please contact us via https://t.me/{bot_username}?start={booking.clinic_id}"
                    await send_sms_async(patient.phone, summary)
                    
                    # Save notification to Chat_Messages table
                    db.add(models.ChatMessage(clinic_id=booking.clinic_id, phone=patient.phone, telegram_id=None, channel='sms', message=None, reply=summary, status='replied'))
                    db.commit()
            except Exception as e:
                print(f"Failed to send booking summary: {e}")

        # Send the generated schedule stages to the bot as a payload
        return {"status": "success", "stages": stages_data}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/update-appointment")
async def update_appointment(booking: UpdateBooking, db: Session = Depends(get_db)): # Added async
    from datetime import datetime, timedelta
    try:
        appt = db.query(models.Appointment).filter(models.Appointment.id == booking.appt_id).first()
        if not appt: raise HTTPException(status_code=404, detail="Appointment not found")
        
        doc_ic = booking.details.get('assigned_doctor_id')
        if not doc_ic or str(doc_ic).upper() in ["ANY", "NONE", "NULL", ""]: doc_ic = None
        appt.doctor_ic = doc_ic
        
        appt.general_notes = booking.details.get('general_notes') 
        
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
                        
                    if (total_stages - start_dose_num + 1) > 1:
                        mapped_appt_type = 'multi-stage'
                
        appt.appt_type = mapped_appt_type
        appt.total_stages = total_stages
        
        start_time = datetime.strptime(booking.scheduled_time, "%Y-%m-%d %H:%M:%S")
        status_val = booking.status

        # -- Rescheduling Agent: UPDATE in place if same vaccine brand, cascade by delta --
        if appt.appt_type == 'multi-stage' and mapped_appt_type == 'multi-stage' and v_model:
            vac_rec = db.query(models.AppointmentVaccine).filter_by(appointment_id=appt.id).first()
            if vac_rec and vac_rec.vaccine_id == v_model.id:
                stage = db.query(models.ApptStage).filter_by(
                    appointment_id=appt.id, stage_name=dose_val
                ).first()
                if not stage:
                    stage = db.query(models.ApptStage).filter_by(
                        appointment_id=appt.id
                    ).order_by(models.ApptStage.id).first()

                if stage:
                    # ── Delta = how far the user moved this booking ──
                    original_time = stage.scheduled_time          # capture BEFORE modification
                    time_delta    = start_time - original_time    # e.g. +2 days / -1 day

                    stage.scheduled_time = start_time
                    stage.status = status_val
                    if status_val == 'canceled' and booking.cancel_reason:
                        stage.cancel_reason = booking.cancel_reason

                    # FIX: Cascade cancel all future doses when marked no-show
                    # Does NOT touch completed doses (dose 1 stays completed)
                    if status_val == 'no-show':
                        def _noshow_dose_num(name: str) -> int:
                            if not name: return 0
                            n = name.lower().strip()
                            if 'single' in n: return 1
                            if 'booster' in n: return 9999
                            m = re.match(r'dose\s+(\d+)', n)
                            return int(m.group(1)) if m else 0

                        this_num = _noshow_dose_num(stage.stage_name or '')
                        if this_num > 0:
                            stages_to_cascade = db.query(models.ApptStage).filter(
                                models.ApptStage.appointment_id == appt.id,
                                models.ApptStage.id != stage.id,
                                models.ApptStage.status.notin_(['completed', 'canceled', 'no-show'])
                            ).all()
                            for fs in stages_to_cascade:
                                if _noshow_dose_num(fs.stage_name or '') > this_num:
                                    fs.status = 'canceled'
                                    fs.cancel_reason = f'Auto-cancelled: {stage.stage_name} was marked as No-Show'

                    all_stages = (
                        db.query(models.ApptStage)
                        .filter_by(appointment_id=appt.id)
                        .order_by(models.ApptStage.scheduled_time.asc())
                        .all()
                    )
                    assigned_doc_ic = appt.doctor_ic
                    found_edited = False

                    for s in all_stages:
                        if s.id == stage.id:
                            found_edited = True
                            continue

                        if not found_edited:
                            continue
                        if s.status == 'completed':
                            continue

                        # Shift by the exact same delta as the edited dose
                        raw_new_dt = s.scheduled_time + time_delta
                        target_date = raw_new_dt.date()

                        # ── Find nearest slot: prefer exact date, then ±7 days ──
                        found_slot = False
                        for raw_off in [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7]:
                            search_dt = target_date + timedelta(days=raw_off)
                            if search_dt < datetime.now().date():
                                continue
                            day_key = search_dt.strftime("%a").lower()

                            avail_q = db.query(models.DoctorClinicAvailability).filter(
                                models.DoctorClinicAvailability.clinic_id == appt.clinic_id,
                                models.DoctorClinicAvailability.day_of_week == day_key,
                                models.DoctorClinicAvailability.status == 'active'
                            )
                            if assigned_doc_ic:
                                avail_q = avail_q.filter(
                                    models.DoctorClinicAvailability.doctor_ic == assigned_doc_ic
                                )
                            avail_row = avail_q.first()

                            if avail_row and avail_row.day_of_week != 'none':
                                try:
                                    # Try to keep same time-of-day; fallback to avail start
                                    for cand_time in [raw_new_dt.time(), avail_row.start_time]:
                                        cand_dt = datetime.combine(search_dt, cand_time)
                                        check_ic = assigned_doc_ic or avail_row.doctor_ic
                                        conflict = (
                                            db.query(models.ApptStage)
                                            .join(models.Appointment)
                                            .filter(
                                                models.Appointment.doctor_ic == check_ic,
                                                models.ApptStage.scheduled_time == cand_dt,
                                                models.ApptStage.status == 'scheduled',
                                                models.ApptStage.id != s.id,
                                            )
                                            .first()
                                        ) if check_ic else None
                                        if not conflict:
                                            s.scheduled_time = cand_dt
                                            found_slot = True
                                            break
                                    if found_slot:
                                        break
                                except Exception:
                                    pass

                        if not found_slot:
                            # No doctor slot nearby — keep mathematically shifted date
                            s.scheduled_time = raw_new_dt

                    db.flush()

                    # ── Build notification including ALL upcoming scheduled stages ──
                    if (
                        getattr(booking, 'source', 'web') == 'web'
                        and not booking.skip_notification
                        and booking.status not in ['completed', 'no-show']
                    ):
                        try:
                            patient_n = db.query(models.Patient).filter_by(id=appt.patient_id).first()
                            if patient_n:
                                dic_n = booking.details.get('assigned_doctor_id')
                                doc_name_n = "ANY"
                                if dic_n and str(dic_n).upper() not in ["ANY", "NONE", "NULL", ""]:
                                    dm = db.query(models.Doctor).filter_by(ic_passport_number=dic_n).first()
                                    if dm:
                                        doc_name_n = dm.name

                                items_n = booking.details.get('items', [])
                                dose_n  = booking.details.get('dose')
                                notes_n = booking.details.get('general_notes')

                                if booking.service_type == 'Vaccine':
                                    det_n = (
                                        f"{items_n[0] if items_n else ''} ({dose_n})"
                                        if dose_n else ", ".join(items_n)
                                    )
                                elif booking.service_type == 'Blood Test':
                                    det_n = ", ".join(items_n) if items_n else ""
                                else:
                                    det_n = str(notes_n) if notes_n else "General Consultation"

                                doc_str_n = f"\nDoctor: {doc_name_n}"

                                if booking.status == 'canceled':
                                    reason_n = (booking.cancel_reason or "Not specified").capitalize()
                                    msg_n = (
                                        f"❌ Appointment Cancelled\n\n"
                                        f"Name: {patient_n.name}\n"
                                        f"IC/Passport: {patient_n.ic_passport_number}\n"
                                        f"Phone: {patient_n.phone}\n"
                                        f"Date: {start_time.strftime('%Y-%m-%d')}\n"
                                        f"Time: {start_time.strftime('%H:%M')}\n"
                                        f"Service: {booking.service_type}\n"
                                        f"Details: {det_n}{doc_str_n}\n"
                                        f"Cancellation Reason: {reason_n}"
                                    )
                                else:
                                    # Fetch all remaining SCHEDULED stages for this series
                                    updated_stages = (
                                        db.query(models.ApptStage)
                                        .filter_by(
                                            appointment_id=appt.id,
                                            status='scheduled'
                                        )
                                        .order_by(models.ApptStage.scheduled_time.asc())
                                        .all()
                                    )
                                    upcoming_lines = "".join(
                                        f"{st.stage_name}\nDate: {st.scheduled_time.strftime('%Y-%m-%d')}\nTime: {st.scheduled_time.strftime('%H:%M')}\n\n"
                                        for st in updated_stages
                                    )
                                    msg_n = (
                                        f"✏️ Booking Successfully Modified!\n\n"
                                        f"Name: {patient_n.name}\n"
                                        f"IC/Passport: {patient_n.ic_passport_number}\n"
                                        f"Phone: {patient_n.phone}\n"
                                        f"Service: {booking.service_type}\n"
                                        f"Details: {det_n}{doc_str_n}\n\n"
                                        f"📅 Updated Upcoming Schedule:\n\n{upcoming_lines}"
                                        f"Don't worry, we will send you a reminder before each appointment."
                                    )

                                bot_u = os.getenv("BOT_USERNAME", "aicas_clinic_bot")
                                if patient_n.telegram_id:
                                    msg_n += (
                                        "\n\nTo rebook, type /start."
                                        if booking.status == 'canceled'
                                        else "\n\nIf there is any modification needed, just type /start and choose 2. Check Appointment Details."
                                    )
                                    tok = os.getenv("TELEGRAM_BOT_TOKEN")
                                    async with httpx.AsyncClient() as hclient:
                                        await hclient.post(
                                            f"https://api.telegram.org/bot{tok}/sendMessage",
                                            json={"chat_id": patient_n.telegram_id, "text": msg_n},
                                        )
                                    db.add(models.ChatMessage(
                                        clinic_id=patient_n.clinic_id,
                                        phone=patient_n.phone,
                                        telegram_id=patient_n.telegram_id,
                                        channel='telegram',
                                        message=None, reply=msg_n, status='replied',
                                    ))
                                else:
                                    msg_n += (
                                        f"\n\nTo rebook, visit https://t.me/{bot_u}?start={patient_n.clinic_id}"
                                        if booking.status == 'canceled'
                                        else f"\n\nContact us via https://t.me/{bot_u}?start={patient_n.clinic_id}"
                                    )
                                    await send_sms_async(patient_n.phone, msg_n)
                                    db.add(models.ChatMessage(
                                        clinic_id=patient_n.clinic_id,
                                        phone=patient_n.phone,
                                        telegram_id=None,
                                        channel='sms',
                                        message=None, reply=msg_n, status='replied',
                                    ))
                                db.commit()
                        except Exception as en:
                            print(f"Failed to send inline update notification: {en}")
                    else:
                        db.commit()

                    return {"status": "success"}

        # -- FALLBACK: Change of service type or vaccine type -> Delete and recreate --
        db.query(models.ApptStage).filter(models.ApptStage.appointment_id == appt.id).delete()
        db.query(models.AppointmentVaccine).filter(models.AppointmentVaccine.appointment_id == appt.id).delete()
        db.query(models.AppointmentBloodTest).filter(models.AppointmentBloodTest.appointment_id == appt.id).delete()
        
        if mapped_appt_type == 'multi-stage' and v_model:
            db.add(models.AppointmentVaccine(appointment_id=appt.id, vaccine_id=v_model.id, dose_number=dose_val))
            schedules = db.query(models.VaccineDoseSchedule).filter_by(vaccine_id=v_model.id).all()
            current_calc_time = start_time
            prev_stage_id = None
            
            for i in range(start_dose_num, v_model.total_doses + 1):
                stage_name = f"Dose {i}"
                if i > start_dose_num:
                    sched = next((s for s in schedules if s.dose_number == i), None)
                    interval_days = sched.interval_days if sched and sched.interval_days is not None else 30
                    current_calc_time = current_calc_time + timedelta(days=interval_days)

                if current_calc_time:
                    # FIX: Future doses become 'canceled' (not 'scheduled') when current is no-show
                    if i == start_dose_num:
                        final_status = status_val
                    elif status_val == 'no-show':
                        final_status = 'canceled'
                    else:
                        final_status = 'scheduled'

                    new_stage = models.ApptStage(
                        appointment_id=appt.id,
                        stage_name=stage_name,
                        scheduled_time=current_calc_time,
                        depends_on_stage_id=prev_stage_id,
                        status=final_status
                    )
                    if final_status == 'canceled':
                        new_stage.cancel_reason = (
                            f'Auto-cancelled: Dose {start_dose_num} was marked as No-Show'
                            if status_val == 'no-show'
                            else booking.cancel_reason
                        )
                    db.add(new_stage)
                    db.flush()
                    prev_stage_id = new_stage.id

            if v_model.has_booster and start_dose_num <= v_model.total_doses + 1:
                if start_dose_num == v_model.total_doses + 1:
                    current_calc_time = start_time
                else:
                    sched = next((s for s in schedules if s.dose_number == v_model.total_doses + 1), None)
                    interval_days = sched.interval_days if sched and sched.interval_days is not None else 180
                    current_calc_time = current_calc_time + timedelta(days=interval_days)

                if current_calc_time:
                    # FIX: Booster also becomes 'canceled' when a prior dose is no-show
                    if start_dose_num == v_model.total_doses + 1:
                        final_status = status_val
                    elif status_val == 'no-show':
                        final_status = 'canceled'
                    else:
                        final_status = 'scheduled'

                    new_stage = models.ApptStage(
                        appointment_id=appt.id,
                        stage_name="Booster",
                        scheduled_time=current_calc_time,
                        depends_on_stage_id=prev_stage_id,
                        status=final_status
                    )
                    if final_status == 'canceled':
                        new_stage.cancel_reason = (
                            f'Auto-cancelled: Dose {start_dose_num} was marked as No-Show'
                            if status_val == 'no-show'
                            else booking.cancel_reason
                        )
                    db.add(new_stage)
                    db.flush()
        else:
            # Strictly determine the stage name based on the service type
            final_stage_name = service
            if service in ['Others', 'Consultation', 'General Appointment', 'General']:
                final_stage_name = 'Others'
            elif service == 'Blood Test':
                final_stage_name = 'Blood Test'
            elif service == 'Vaccine':
                final_stage_name = booking.details.get("dose", "Single Dose")

            if service == 'Vaccine' and items_list and v_model:
                db.add(models.AppointmentVaccine(appointment_id=appt.id, vaccine_id=v_model.id, dose_number=dose_val))
            elif service == 'Blood Test' and items_list:
                for t_name in items_list:
                    bt = db.query(models.BloodTest).filter_by(name=t_name).first()
                    if bt: db.add(models.AppointmentBloodTest(appointment_id=appt.id, blood_test_id=bt.id))
                    
            new_stage = models.ApptStage(
                appointment_id=appt.id, 
                stage_name=final_stage_name, 
                scheduled_time=start_time, 
                status=status_val
            )
            if status_val == 'canceled':
                new_stage.cancel_reason = booking.cancel_reason
            db.add(new_stage)
            
        db.commit()

        # Send Modification Summary ONLY if requested from the React Website
        # AND do NOT send if we are purely marking the appointment as completed or no-show
        if getattr(booking, 'source', 'web') == 'web' and not booking.skip_notification and booking.status not in ['completed', 'no-show']:
            try:
                patient = db.query(models.Patient).filter(models.Patient.id == appt.patient_id).first()
                if patient:
                    # ADD THESE TWO LINES:
                    date_part = booking.scheduled_time.split(" ")[0]
                    time_part = booking.scheduled_time.split(" ")[1][:5]
                    doc_ic = booking.details.get('assigned_doctor_id')
                    actual_doc_name = "ANY"
                    if doc_ic and str(doc_ic).upper() not in ["ANY", "NONE", "NULL", ""]:
                        doc_model = db.query(models.Doctor).filter_by(ic_passport_number=doc_ic).first()
                        if doc_model:
                            actual_doc_name = doc_model.name
                            
                    items = booking.details.get('items', [])
                    dose = booking.details.get('dose')
                    notes = booking.details.get('general_notes')
                    
                    if booking.service_type == 'Vaccine':
                        details_str = f"{items[0] if items else ''} ({dose})" if dose else ", ".join(items)
                    elif booking.service_type == 'Blood Test':
                        details_str = ", ".join(items) if items else ""
                    else:
                        details_str = str(notes) if notes else "General Consultation"
                        
                    doctor_str = f"\nDoctor: {actual_doc_name}"
                    
                    if booking.status == 'canceled':
                        reason_fb = (booking.cancel_reason or "Not specified").capitalize()
                        summary = (
                            f"❌ Appointment Cancelled\n\n"
                            f"Name: {patient.name}\n"
                            f"IC/Passport: {patient.ic_passport_number}\n"
                            f"Phone: {patient.phone}\n"
                            f"Date: {date_part}\nTime: {time_part}\n"
                            f"Service: {booking.service_type}\n"
                            f"Details: {details_str}{doctor_str}\n"
                            f"Cancellation Reason: {reason_fb}"
                        )
                    else:
                        date_part = booking.scheduled_time.split(" ")[0]
                        time_part = booking.scheduled_time.split(" ")[1][:5]
                        fallback_stages = (
                            db.query(models.ApptStage)
                            .filter_by(appointment_id=appt.id, status='scheduled')
                            .order_by(models.ApptStage.scheduled_time.asc())
                            .all()
                        )
                        upcoming_fb = "".join(
                            f"{st.stage_name}\nDate: {st.scheduled_time.strftime('%Y-%m-%d')}\nTime: {st.scheduled_time.strftime('%H:%M')}\n\n"
                            for st in fallback_stages
                        )
                        summary = (
                            f"✏️ Booking Successfully Modified!\n\n"
                            f"Name: {patient.name}\n"
                            f"IC/Passport: {patient.ic_passport_number}\n"
                            f"Phone: {patient.phone}\n"
                            f"New Date: {date_part}\nNew Time: {time_part}\n"
                            f"Service: {booking.service_type}\n"
                            f"Details: {details_str}{doctor_str}"
                            + (f"\n\n📅 Updated Upcoming Schedule:\n\n{upcoming_fb}Don't worry, we will send you a reminder before each appointment." if fallback_stages else "")
                        )

                    bot_username = os.getenv("BOT_USERNAME", "aicas_clinic_bot")

                    if patient.telegram_id:
                        if booking.status == 'canceled':
                            summary += "\n\nTo rebook, please type /start."
                        else:
                            summary += "\n\nIf there is any modification needed, just type /start and choose 2. Check Appointment Details."
                        token = os.getenv("TELEGRAM_BOT_TOKEN")
                        async with httpx.AsyncClient() as client:
                            await client.post(f"https://api.telegram.org/bot{token}/sendMessage",
                                            json={"chat_id": patient.telegram_id, "text": summary})
                        db.add(models.ChatMessage(clinic_id=patient.clinic_id, phone=patient.phone,
                                                telegram_id=patient.telegram_id, channel='telegram',
                                                message=None, reply=summary, status='replied'))
                        db.commit()
                    else:
                        if booking.status == 'canceled':
                            summary += f"\n\nTo rebook, visit https://t.me/{bot_username}?start={patient.clinic_id}"
                        else:
                            summary += f"\n\nIf there is any modification needed, please contact us via https://t.me/{bot_username}?start={patient.clinic_id}"
                        await send_sms_async(patient.phone, summary)
                        db.add(models.ChatMessage(clinic_id=patient.clinic_id, phone=patient.phone,
                                                telegram_id=None, channel='sms',
                                                message=None, reply=summary, status='replied'))
                        db.commit()
            except Exception as e:
                print(f"Failed to send update summary: {e}")

        return {"status": "success"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    
@app.post("/cancel-appointment/{appt_id}")
async def cancel_appointment(appt_id: str, req: CancelReq, db: Session = Depends(get_db)):
    db.query(models.ApptStage).filter(models.ApptStage.appointment_id == appt_id).update({"status": "canceled", "cancel_reason": req.cancel_reason})
    db.commit()
    
    if getattr(req, 'source', 'web') == 'web' and not getattr(req, 'skip_notification', False):
        try:
            appt = db.query(models.Appointment).filter(models.Appointment.id == appt_id).first()
            if appt:
                patient = db.query(models.Patient).filter(models.Patient.id == appt.patient_id).first()
                if patient:
                    summary = (f"❌ Booking Successfully Cancelled!\n\n"
                               f"Name: {patient.name}\n"
                               f"IC/Passport: {patient.ic_passport_number}\n"
                               f"Reason: {req.cancel_reason}")
                               
                    bot_username = os.getenv("BOT_USERNAME", "aicas_clinic_bot")
                    
                    if patient.telegram_id:
                        summary += "\n\nIf there is any modification needed, just type /start and choose 2. Check Appointment Details."
                        token = os.getenv("TELEGRAM_BOT_TOKEN")
                        async with httpx.AsyncClient() as client:
                            await client.post(f"https://api.telegram.org/bot{token}/sendMessage", json={
                                "chat_id": patient.telegram_id, 
                                "text": summary
                            })
                            
                        # Save notification to Chat_Messages table
                        db.add(models.ChatMessage(clinic_id=patient.clinic_id, phone=patient.phone, telegram_id=patient.telegram_id, channel='telegram', message=None, reply=summary, status='replied'))
                        db.commit()
                    else:
                        summary += f"\n\nIf there is any modification needed, please contact us via https://t.me/{bot_username}?start={patient.clinic_id}"
                        await send_sms_async(patient.phone, summary)
                        
                        # Save notification to Chat_Messages table
                        db.add(models.ChatMessage(clinic_id=patient.clinic_id, phone=patient.phone, telegram_id=None, channel='sms', message=None, reply=summary, status='replied'))
                        db.commit()
        except Exception as e:
            print(f"Failed to send cancel summary: {e}")
            
    return {"status": "success"}

@app.post("/admin/notify-cancellation")
async def notify_cancellation(req: CancelNotifyReq, db: Session = Depends(get_db)):
    stage = db.query(models.ApptStage).filter_by(id=req.stage_id).first()
    if not stage: return {"status": "skip"}
    appt = db.query(models.Appointment).filter_by(id=stage.appointment_id).first()
    if not appt: return {"status": "skip"}
    patient = db.query(models.Patient).filter_by(id=appt.patient_id).first()
    if not patient: return {"status": "skip"}

    doc = db.query(models.Doctor).filter_by(ic_passport_number=appt.doctor_ic).first() if appt.doctor_ic else None
    appt_vaccines = db.query(models.AppointmentVaccine).filter_by(appointment_id=appt.id).all()
    appt_tests = db.query(models.AppointmentBloodTest).filter_by(appointment_id=appt.id).all()

    service = "Others"
    details_str = appt.general_notes or "General Consultation"
    if appt_vaccines:
        service = "Vaccine"
        v = db.query(models.Vaccine).filter_by(id=appt_vaccines[0].vaccine_id).first()
        details_str = f"{v.name} ({stage.stage_name})" if v else stage.stage_name
    elif appt_tests:
        service = "Blood Test"
        test_names = []
        for at in appt_tests:
            bt = db.query(models.BloodTest).filter_by(id=at.blood_test_id).first()
            if bt: test_names.append(bt.name)
        details_str = ", ".join(test_names)

    doctor_str = doc.name if doc else "ANY"
    reason_text = req.cancel_reason.capitalize() if req.cancel_reason else "Not specified"
    cascade_note = f"\n(+ {req.total_cancelled - 1} additional dependent dose(s) cancelled)" if req.total_cancelled > 1 else ""

    summary = (f"❌ Appointment Cancelled\n\n"
               f"Name: {patient.name}\n"
               f"IC/Passport: {patient.ic_passport_number}\n"
               f"Service: {service}\n"
               f"Details: {details_str}\n"
               f"Date: {stage.scheduled_time.strftime('%Y-%m-%d')}\n"
               f"Time: {stage.scheduled_time.strftime('%H:%M')}\n"
               f"Doctor: {doctor_str}\n"
               f"Cancellation Reason: {reason_text}{cascade_note}")

    bot_username = os.getenv("BOT_USERNAME", "aicas_clinic_bot")
    try:
        if patient.telegram_id:
            summary += "\n\nTo rebook, please type /start."
            token = os.getenv("TELEGRAM_BOT_TOKEN")
            async with httpx.AsyncClient() as client:
                await client.post(f"https://api.telegram.org/bot{token}/sendMessage",
                                  json={"chat_id": patient.telegram_id, "text": summary})
            db.add(models.ChatMessage(clinic_id=patient.clinic_id, phone=patient.phone,
                                      telegram_id=patient.telegram_id, channel='telegram',
                                      message=None, reply=summary, status='replied'))
            db.commit()
        else:
            summary += f"\n\nTo rebook, visit https://t.me/{bot_username}?start={patient.clinic_id}"
            await send_sms_async(patient.phone, summary)
            db.add(models.ChatMessage(clinic_id=patient.clinic_id, phone=patient.phone,
                                      telegram_id=None, channel='sms',
                                      message=None, reply=summary, status='replied'))
            db.commit()
    except Exception as e:
        print(f"Failed to send cancellation notification: {e}")
    return {"status": "success"}

@app.post("/admin/agent-log")
def create_agent_log_entry(req: AgentLogCreateReq, db: Session = Depends(get_db)):
    try:
        import uuid as _uuid
        _uuid.UUID(req.clinic_id)
    except (ValueError, TypeError):
        req.clinic_id = "c1111111-1111-1111-1111-111111111111"
    log = models.AgentLog(clinic_id=req.clinic_id, action=req.action, reasoning=req.reasoning)
    db.add(log)
    db.commit()
    return {"status": "success"}

@app.delete("/delete-appointment/{stage_id}")
def delete_appointment(stage_id: str, db: Session = Depends(get_db)):
    try:
        # 1. Find the specific stage the user wants to delete
        stage = db.query(models.ApptStage).filter(models.ApptStage.id == stage_id).first()
        if not stage:
            raise HTTPException(status_code=404, detail="Appointment stage not found")
        
        appt_id = stage.appointment_id
        
        # 2. Delete the specific stage
        db.delete(stage)
        db.commit()
        
        # --- ORPHAN CLEANUP LOGIC ---
        # 3. Count how many stages are left for this parent appointment
        remaining_stages = db.query(models.ApptStage).filter(models.ApptStage.appointment_id == appt_id).count()
        
        # 4. If no stages are left, completely remove the parent appointment and its details
        if remaining_stages == 0:
            # Clean up related service tables first (to avoid foreign key constraint errors)
            db.query(models.AppointmentVaccine).filter(models.AppointmentVaccine.appointment_id == appt_id).delete()
            db.query(models.AppointmentBloodTest).filter(models.AppointmentBloodTest.appointment_id == appt_id).delete()
            
            # Finally, delete the parent appointment itself
            db.query(models.Appointment).filter(models.Appointment.id == appt_id).delete()
            db.commit()
        # ----------------------------
        
        return {"status": "success", "message": "Appointment deleted successfully"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/admin/patients/{clinic_id}")
def admin_get_patients(clinic_id: str, db: Session = Depends(get_db)):
    return db.query(models.Patient).filter(models.Patient.clinic_id == clinic_id).all()

@app.put("/admin/patients/{patient_id}")
def admin_update_patient(patient_id: str, data: PatientUpdate, db: Session = Depends(get_db)):
    p = db.query(models.Patient).filter_by(id=patient_id).first()
    if p:
        try:
            if data.ic_passport_number and data.ic_passport_number.upper() != p.ic_passport_number:
                p.ic_passport_number = data.ic_passport_number.upper()
            
            p.name = data.name.upper()
            p.phone = data.phone
            p.gender = data.gender.upper()
            p.nationality = data.nationality.upper()
            p.address = data.address.upper() if data.address else None
            db.commit()
        except HTTPException:
            db.rollback()
            raise
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=400, detail=f"Update failed: {e}")
    return {"status": "success"}

@app.delete("/admin/patients/{patient_id}")
def admin_delete_patient(patient_id: str, db: Session = Depends(get_db)):
    db.query(models.Patient).filter_by(id=patient_id).delete()
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
            "allow_repeat_series": getattr(v, 'allow_repeat_series', False),
            "repeat_interval_days": getattr(v, 'repeat_interval_days', None),
            "restart_if_interrupted": getattr(v, 'restart_if_interrupted', False),
            "interruption_restart_days": getattr(v, 'interruption_restart_days', None),
            "schedules": [{"dose_number": s.dose_number, "interval_days": s.interval_days} for s in scheds]
        })
    return res

@app.post("/admin/ai/vaccine-schedule")
async def ai_vaccine_schedule(req: VaccineAIRequest):
    return await generate_vaccine_schedule_ai(req.search_query)

@app.post("/admin/vaccines")
def create_vaccine(data: VaccineCreate, db: Session = Depends(get_db)):
    try:
        # --- Enforce Dependencies ---
        if not data.allow_repeat_series:
            data.repeat_interval_days = None
        if not data.restart_if_interrupted:
            data.interruption_restart_days = None
        # ----------------------------
        v_id = data.vaccine_id
        formatted_name = data.name.title() if data.name else None
        
        if not v_id and formatted_name:
            existing_v = db.query(models.Vaccine).filter(models.Vaccine.name.ilike(formatted_name)).first()
            if existing_v:
                v_id = existing_v.id
                
        if not v_id:
            normalized_type = normalize_vaccine_type(db, data.type)
            v = models.Vaccine(
                name=formatted_name, type=normalized_type, total_doses=data.total_doses, 
                has_booster=data.has_booster, target_gender=data.target_gender.upper(),
                allow_repeat_series=data.allow_repeat_series, repeat_interval_days=data.repeat_interval_days,
                restart_if_interrupted=data.restart_if_interrupted, interruption_restart_days=data.interruption_restart_days
            )
            db.add(v)
            db.flush() 
            v_id = v.id
            for sched in data.schedules:
                db.add(models.VaccineDoseSchedule(vaccine_id=v_id, dose_number=sched.get('dose_number'), interval_days=sched.get('interval_days', 0)))
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
                db.add(models.VaccineDoseSchedule(vaccine_id=v_id, dose_number=sched.get('dose_number'), interval_days=sched.get('interval_days', 0)))
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
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/admin/vaccines/{v_id}")
def update_vaccine(v_id: int, data: VaccineCreate, db: Session = Depends(get_db)):
    try:
        # --- Enforce Dependencies ---
        if not data.allow_repeat_series:
            data.repeat_interval_days = None
        if not data.restart_if_interrupted:
            data.interruption_restart_days = None
        # ----------------------------
        v = db.query(models.Vaccine).filter_by(id=v_id).first()
        if v:
            v.name = data.name.title() if data.name else ""
            v.type = normalize_vaccine_type(db, data.type)
            v.total_doses = data.total_doses
            v.has_booster = data.has_booster
            v.target_gender = data.target_gender.upper()
            v.allow_repeat_series = data.allow_repeat_series
            v.repeat_interval_days = data.repeat_interval_days
            v.restart_if_interrupted = data.restart_if_interrupted
            v.interruption_restart_days = data.interruption_restart_days
            
        vc = db.query(models.VaccineClinic).filter_by(vaccine_id=v_id, clinic_id=data.clinic_id).first()
        if vc: 
            vc.price = data.price
            vc.stock_quantity = data.stock_quantity
            vc.low_stock_threshold = data.low_stock_threshold

        db.query(models.VaccineDoseSchedule).filter_by(vaccine_id=v_id).delete()
        for sched in data.schedules:
            db.add(models.VaccineDoseSchedule(vaccine_id=v_id, dose_number=sched.get('dose_number'), interval_days=sched.get('interval_days', 0)))

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
            prev_date = dose1_stage.scheduled_time
            
            for sched in data.schedules:
                d_num = sched.get('dose_number')
                interval_days = sched.get('interval_days')
                
                if d_num == 1:
                    continue
                    
                stage_name = f"dose {d_num}" if d_num <= data.total_doses else "booster"
                stage = stage_dict.get(stage_name)
                
                if not stage:
                    continue
                    
                if stage.status == "completed" or stage.scheduled_time < now:
                    prev_date = stage.scheduled_time
                    continue
                    
                if interval_days is None:
                    continue
                    
                new_date = prev_date + timedelta(days=interval_days)
                
                if new_date:
                    stage.scheduled_time = new_date
                    prev_date = new_date

        db.commit()
        return {"status": "success"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/admin/vaccines/{v_id}/{clinic_id}")
def delete_vaccine(v_id: int, clinic_id: str, db: Session = Depends(get_db)):
    db.query(models.VaccineClinic).filter_by(vaccine_id=v_id, clinic_id=clinic_id).delete()
    db.commit()
    return {"status": "success"}

@app.get("/vaccines/{clinic_id}")
def get_vaccines(clinic_id: str, db: Session = Depends(get_db)):
    vacs = db.query(models.VaccineClinic).filter_by(clinic_id=clinic_id).all()
    res = []
    for vc in vacs:
        v = db.query(models.Vaccine).filter_by(id=vc.vaccine_id).first()
        if v:
            scheds = db.query(models.VaccineDoseSchedule).filter_by(vaccine_id=v.id).all()
            
            # Calculate held vaccines (Scheduled appointments for Dose 1 / Single Dose)
            held_count = db.query(models.AppointmentVaccine).join(
                models.ApptStage, models.AppointmentVaccine.appointment_id == models.ApptStage.appointment_id
            ).filter(
                models.AppointmentVaccine.vaccine_id == v.id,
                models.ApptStage.status == 'scheduled',
                models.ApptStage.stage_name.in_(['Dose 1', 'Single Dose'])
            ).count()
            
            effective_stock = vc.stock_quantity - held_count
            is_low_stock = effective_stock <= vc.low_stock_threshold

            res.append({
                "id": v.id, "name": v.name, "type": v.type, "price": float(vc.price),
                "total_doses": v.total_doses, "has_booster": v.has_booster, "target_gender": getattr(v, 'target_gender', 'ANY'),
                "allow_repeat_series": getattr(v, 'allow_repeat_series', False),
                "repeat_interval_days": getattr(v, 'repeat_interval_days', None),
                "restart_if_interrupted": getattr(v, 'restart_if_interrupted', False),
                "interruption_restart_days": getattr(v, 'interruption_restart_days', None),
                "stock_quantity": vc.stock_quantity,
                "low_stock_threshold": vc.low_stock_threshold,
                "held_quantity": held_count,
                "is_low_stock": is_low_stock,
                "schedules": [{"dose_number": s.dose_number, "interval_days": s.interval_days} for s in scheds]
            })
    return res

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
    except HTTPException:
        db.rollback()
        raise
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
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/admin/blood-tests/{bt_id}")
def delete_bt(bt_id: int, db: Session = Depends(get_db)):
    db.query(models.BloodTest).filter_by(id=bt_id).delete()
    db.commit()
    return {"status": "success"}

@app.get("/blood-tests/{clinic_id}/{t_type}")
def get_blood_tests_by_type(clinic_id: str, t_type: str, db: Session = Depends(get_db)):
    tests = db.query(models.BloodTest).filter(models.BloodTest.clinic_id == clinic_id, models.BloodTest.test_type == t_type).all()
    res = []
    for t in tests:
        test_dict = {
            "id": t.id, 
            "name": t.name, 
            "description": t.description, 
            "price": float(t.price), 
            "target_gender": t.target_gender, 
            "test_type": t.test_type,
            "component_ids": []
        }
        if t_type == "package":
            components = db.query(models.BloodTestComponent).filter(models.BloodTestComponent.package_id == t.id).all()
            included_names = []
            comp_ids = []
            for comp in components:
                comp_ids.append(comp.test_id)
                s_test = db.query(models.BloodTest).filter(models.BloodTest.id == comp.test_id).first()
                if s_test: included_names.append(s_test.name)
            test_dict["included_tests"] = included_names
            test_dict["component_ids"] = comp_ids
        res.append(test_dict)
    return res

@app.post("/admin/auto-replies")
def admin_add_chatbot_reply(data: AdminChatReply, db: Session = Depends(get_db)):
    new_msg = models.ChatMessage(clinic_id=data.clinic_id, message=data.question, reply=data.answer, status='auto_rule')
    db.add(new_msg)
    db.commit()
    logging_agent(db, data.clinic_id, "Automated Message Updated", f"Admin added rule for: {data.question}")
    return {"status": "success"}

@app.post("/ask-admin")
def ask_admin(msg: ChatMessageModel, db: Session = Depends(get_db)):
    # REMOVED the duplicate DB insert. 
    # 'log_all_incoming' in bot.py inherently saves all user text via /log-chat.
    # This prevents the exact duplicate entries you are seeing.
    return {"status": "success"}

@app.get("/admin/chat-pending-count/{clinic_id}")
def get_pending_chat_count(clinic_id: str, db: Session = Depends(get_db)):
    count = db.query(models.ChatMessage).filter_by(clinic_id=clinic_id, status='unread').count()
    return {"count": count}

class ChatReplyReq(BaseModel):
    clinic_id: str
    reply_text: str
    telegram_id: Optional[int] = None
    phone: Optional[str] = None

@app.post("/admin/chat-reply")
async def reply_chat(req: ChatReplyReq, db: Session = Depends(get_db)):
    # 1. Save Admin's message to DB immediately (leaving 'message' blank forces it to the right side)
    new_msg = models.ChatMessage(
        clinic_id=req.clinic_id,
        telegram_id=req.telegram_id,
        phone=req.phone,
        channel='telegram' if req.telegram_id else 'sms',
        message=None,         
        reply=req.reply_text, 
        status='replied'
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)
    
    # 2. Forward to Telegram User
    if req.telegram_id:
        token = os.getenv("TELEGRAM_BOT_TOKEN")
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": req.telegram_id, "text": f"👨‍⚕️ *Clinic Admin:*\n{req.reply_text}", "parse_mode": "Markdown"}
            )
            if res.status_code == 200:
                data = res.json()
                new_msg.telegram_message_id = data['result']['message_id']
                db.commit()
                
    return {"status": "success"}

class MarkReadReq(BaseModel):
    chat_key: str
    clinic_id: str

class EditMsgReq(BaseModel):
    new_text: str

@app.get("/admin/chat-history/{clinic_id}")
def get_chat_history(clinic_id: str, db: Session = Depends(get_db)):
    msgs = db.query(models.ChatMessage).filter(models.ChatMessage.clinic_id == clinic_id).order_by(models.ChatMessage.created_at.asc()).all()
    return msgs

@app.put("/admin/chat-read")
def mark_chat_read(req: MarkReadReq, db: Session = Depends(get_db)):
    query = db.query(models.ChatMessage).filter(models.ChatMessage.clinic_id == req.clinic_id, models.ChatMessage.status == 'unread')
    if req.chat_key.startswith("TG-"):
        query = query.filter(models.ChatMessage.telegram_id == int(req.chat_key.replace("TG-", "")))
    elif req.chat_key.startswith("SMS-"):
        query = query.filter(models.ChatMessage.phone == req.chat_key.replace("SMS-", ""))
    query.update({"status": "replied"}, synchronize_session=False)
    db.commit()
    return {"status": "success"}

@app.put("/admin/chat-reply/{msg_id}")
async def edit_chat_reply(msg_id: int, req: EditMsgReq, db: Session = Depends(get_db)):
    msg = db.query(models.ChatMessage).filter_by(id=msg_id).first()
    if not msg: raise HTTPException(status_code=404)
    msg.reply = req.new_text
    db.commit()
    if msg.channel == 'telegram' and msg.telegram_message_id:
        token = os.getenv("TELEGRAM_BOT_TOKEN")
        async with httpx.AsyncClient() as client:
            await client.post(
                f"https://api.telegram.org/bot{token}/editMessageText",
                json={"chat_id": msg.telegram_id, "message_id": msg.telegram_message_id, "text": f"👨‍⚕️ *Clinic Admin (Edited):*\n{req.new_text}", "parse_mode": "Markdown"}
            )
    return {"status": "success"}

@app.delete("/admin/chat-reply/{msg_id}")
async def delete_chat_reply(msg_id: int, db: Session = Depends(get_db)):
    msg = db.query(models.ChatMessage).filter_by(id=msg_id).first()
    if not msg: raise HTTPException(status_code=404)
    if msg.channel == 'telegram' and msg.telegram_message_id:
        token = os.getenv("TELEGRAM_BOT_TOKEN")
        async with httpx.AsyncClient() as client:
            await client.post(f"https://api.telegram.org/bot{token}/deleteMessage", json={"chat_id": msg.telegram_id, "message_id": msg.telegram_message_id})
    db.delete(msg)
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
    
    clashes = db.query(models.ApptStage.scheduled_time, models.Appointment.doctor_ic).join(models.Appointment).join(models.Patient, models.Appointment.patient_id == models.Patient.id).filter(models.Patient.clinic_id == clinic_id, models.ApptStage.scheduled_time >= start_of_day, models.ApptStage.scheduled_time <= end_of_day).all()
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
            doc_map[doc.ic_passport_number] = {
                "ic_passport_number": doc.ic_passport_number,
                "name": doc.name,
                "gender": doc.gender,
                "specialization": doc.specialization,
                "status": avail.status,
                "resign_reason": avail.resign_reason
            }
    return list(doc_map.values())

@app.get("/doctors/{clinic_id}")
def get_doctors(clinic_id: str, db: Session = Depends(get_db)):
    doctors = db.query(models.Doctor).join(
        models.DoctorClinicAvailability, models.Doctor.ic_passport_number == models.DoctorClinicAvailability.doctor_ic
    ).filter(models.DoctorClinicAvailability.clinic_id == clinic_id).distinct().all()
    return doctors

@app.post("/admin/doctors")
def create_doctor(data: DoctorCreateReq, db: Session = Depends(get_db)):
    final_name = format_doctor_name(data.name)
    existing = db.query(models.Doctor).filter_by(ic_passport_number=data.ic).first()
    if not existing:
        new_doc = models.Doctor(
            ic_passport_number=data.ic, 
            name=final_name, 
            gender=data.gender, 
            specialization=data.specialization
        )
        db.add(new_doc)
        db.flush()
    else:
        existing.name = final_name
        existing.gender = data.gender
        existing.specialization = data.specialization
        db.flush()
        
    link = db.query(models.DoctorClinicAvailability).filter_by(doctor_ic=data.ic, clinic_id=data.clinic_id, day_of_week='none').first()
    db_status = 'inactive' if data.status == 'resigned' else (data.status or 'active')
    db_reason = data.resign_reason if data.status == 'resigned' else None
    
    if not link:
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
    else:
        link.status = db_status
        link.resign_reason = db_reason

    db.query(models.DoctorClinicAvailability).filter_by(doctor_ic=data.ic, clinic_id=data.clinic_id).update({
        "status": db_status,
        "resign_reason": db_reason
    })
        
    db.commit()
    return {"status": "success"}

@app.put("/admin/doctors/{ic}")
def update_doctor(ic: str, data: DoctorCreateReq, db: Session = Depends(get_db)):
    doc = db.query(models.Doctor).filter_by(ic_passport_number=ic).first()
    if doc:
        doc.name = format_doctor_name(data.name)
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

    if st >= et:
        raise HTTPException(status_code=400, detail="End time must be later than start time.")

    existing_avails = db.query(models.DoctorClinicAvailability).filter_by(
        doctor_ic=ic, clinic_id=data.clinic_id, day_of_week=data.day_of_week
    ).all()

    for a in existing_avails:
        if a.day_of_week == 'none':
            continue
        if a.start_time < et and a.end_time > st:
            raise HTTPException(status_code=400, detail="This time slot clashes with an existing schedule for this day.")

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

@app.get("/patient/{clinic_id}/id/{ic_passport}")
def get_patient_by_id(clinic_id: str, ic_passport: str, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(models.Patient.clinic_id == clinic_id, models.Patient.ic_passport_number == ic_passport).first()
    if not patient: raise HTTPException(status_code=404, detail="Patient not found")
    return patient

@app.get("/patient/{clinic_id}/appointments/{ic}")
def get_patient_appointments(clinic_id: str, ic: str, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(models.Patient.clinic_id == clinic_id, models.Patient.ic_passport_number == ic).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Get all stages (no time filter) for this patient
    stages = db.query(models.ApptStage, models.Appointment, models.Doctor).join(
        models.Appointment, models.ApptStage.appointment_id == models.Appointment.id
    ).outerjoin(
        models.Doctor, models.Appointment.doctor_ic == models.Doctor.ic_passport_number
    ).filter(
        models.Appointment.patient_id == patient.id,
        models.ApptStage.status != 'canceled'
    ).order_by(models.ApptStage.scheduled_time.asc()).all()
    
    res = []
    for stage, appt, doc in stages:
        appt_vaccines = db.query(models.AppointmentVaccine).filter_by(appointment_id=appt.id).all()
        appt_tests = db.query(models.AppointmentBloodTest).filter_by(appointment_id=appt.id).all()
        
        service = "Others"
        item_names = []
        dose = stage.stage_name   # e.g., "Dose 1", "Dose 2", "Booster"
        reason = appt.general_notes
        
        if appt_vaccines:
            service = "Vaccine"
            # Get vaccine name from the first vaccine (should be same for all doses)
            first_vac = appt_vaccines[0]
            v = db.query(models.Vaccine).filter_by(id=first_vac.vaccine_id).first()
            if v:
                item_names = [v.name]
        elif appt_tests:
            service = "Blood Test"
            for at in appt_tests:
                bt = db.query(models.BloodTest).filter_by(id=at.blood_test_id).first()
                if bt:
                    item_names.append(bt.name)
        elif reason:
            service = "Others"
        
        details_block = {
            "items": item_names,
            "dose": dose,
            "reason": reason,
            "assigned_doctor_name": doc.name if doc else "ANY",
            "assigned_doctor_id": str(doc.ic_passport_number) if doc else None,
            "service_type": service
        }
        res.append({
            "appt_id": str(appt.id),
            "stage_id": str(stage.id),
            "service": service,
            "details": details_block,
            "date": stage.scheduled_time.strftime("%Y-%m-%d"),
            "time": stage.scheduled_time.strftime("%H:%M:%S"),
            "doctor_name": doc.name if doc else "ANY",
            "status": stage.status  # ADD THIS
        })
    return res

@app.get("/patient-clinics/{telegram_id}")
def get_patient_clinics(telegram_id: int, db: Session = Depends(get_db)):
    patients = db.query(models.Patient).filter(models.Patient.telegram_id == telegram_id).all()
    if not patients:
        return []
    clinic_ids = list(set([p.clinic_id for p in patients]))
    clinics = db.query(models.Clinic).filter(models.Clinic.id.in_(clinic_ids)).all()
    return [{"id": str(c.id), "name": c.name} for c in clinics]

import base64
from fastapi import UploadFile, File
import warnings

# Suppress PyTorch DataLoader warning for EasyOCR
warnings.filterwarnings("ignore", category=UserWarning, module="torch.utils.data")

class LogChatReq(BaseModel):
    clinic_id: str
    telegram_id: Optional[int] = None
    phone: Optional[str] = None
    channel: str = "telegram"
    message: Optional[str] = None
    reply: Optional[str] = None
    status: str = "unread"
    telegram_message_id: Optional[int] = None

import uuid
from typing import Optional
from pydantic import BaseModel

class LogChatReq(BaseModel):
    clinic_id: str
    telegram_id: Optional[int] = None
    phone: Optional[str] = None
    channel: str = "telegram"
    message: Optional[str] = None
    reply: Optional[str] = None
    status: str = "unread"
    telegram_message_id: Optional[int] = None

@app.post("/log-chat")
def log_chat_endpoint(req: LogChatReq, db: Session = Depends(get_db)):
    try:
        try:
            uuid.UUID(req.clinic_id)
        except (ValueError, TypeError):
            req.clinic_id = "c1111111-1111-1111-1111-111111111111" 

        # Automatically fetch phone number if missing to prevent duplicate rows without phone
        if req.telegram_id and not req.phone:
            patient = db.query(models.Patient).filter_by(telegram_id=req.telegram_id, clinic_id=req.clinic_id).first()
            if patient:
                req.phone = patient.phone

        new_chat = models.ChatMessage(**req.dict(exclude_unset=True))
        
        # Explicitly assign it if we fetched it above
        if req.phone:
            new_chat.phone = req.phone
            
        db.add(new_chat)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

# --- TEMPLATE MODULE ---
@app.get("/admin/chat-templates/{clinic_id}")
def get_chat_templates(clinic_id: str, db: Session = Depends(get_db)):
    return db.query(models.ChatTemplate).filter_by(clinic_id=clinic_id).all()

@app.post("/admin/chat-templates")
def create_chat_template(data: ChatTemplateCreate, db: Session = Depends(get_db)):
    tpl = models.ChatTemplate(clinic_id=data.clinic_id, title=data.title, message=data.message)
    db.add(tpl)
    db.commit()
    return {"status": "success", "id": tpl.id}

@app.put("/admin/chat-templates/{tpl_id}")
def update_chat_template(tpl_id: int, data: ChatTemplateCreate, db: Session = Depends(get_db)):
    tpl = db.query(models.ChatTemplate).filter_by(id=tpl_id).first()
    if tpl:
        tpl.title = data.title
        tpl.message = data.message
        db.commit()
    return {"status": "success"}

@app.delete("/admin/chat-templates/{tpl_id}")
def delete_chat_template(tpl_id: int, db: Session = Depends(get_db)):
    db.query(models.ChatTemplate).filter_by(id=tpl_id).delete()
    db.commit()
    return {"status": "success"}

# --- NEW CHAT / SMS LOGIC ---
@app.post("/admin/new-chat")
async def new_chat(req: NewChatReq, db: Session = Depends(get_db)):
    # Check if this phone number exists in the Patients table
    existing_patient = db.query(models.Patient).filter(
        models.Patient.clinic_id == req.clinic_id,
        models.Patient.phone == req.phone
    ).first()

    telegram_id = existing_patient.telegram_id if existing_patient and existing_patient.telegram_id else None
    channel = 'telegram' if telegram_id else 'sms'
    final_message = req.message

    if channel == 'sms':
        bot_username = os.getenv("BOT_USERNAME", "aicas_clinic_bot")
        final_message += f"\n\n[You can also contact us on Telegram: https://t.me/{bot_username}]"

    # Database store occurs BEFORE sending the message
    new_msg = models.ChatMessage(
        clinic_id=req.clinic_id, phone=req.phone, telegram_id=telegram_id,
        channel=channel, message=None, reply=final_message, status='replied'
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)

    if channel == 'telegram':
        token = os.getenv("TELEGRAM_BOT_TOKEN")
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": telegram_id, "text": f"👨‍⚕️ *Clinic Admin:*\n{final_message}", "parse_mode": "Markdown"}
            )
            if res.status_code == 200:
                new_msg.telegram_message_id = res.json()['result']['message_id']
                db.commit()
    else:
        # Send actual SMS
        await send_sms_async(req.phone, final_message)

    return {"status": "success", "channel": channel, "telegram_id": telegram_id, "phone": req.phone}

# --- PASS TO BOT ---
@app.post("/admin/pass-to-bot")
async def pass_to_bot(req: PassToBotReq, db: Session = Depends(get_db)):
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    keyboard = {
        "inline_keyboard": [
            [{"text": "Yes", "callback_data": "help_yes"}, {"text": "No, I'm done", "callback_data": "help_no"}]
        ]
    }
    async with httpx.AsyncClient() as client:
        await client.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": req.telegram_id, "text": "Is there anything else I can help you with?", "reply_markup": keyboard}
        )
    
    # Log this action so the admin sees the chat is handed back
    new_msg = models.ChatMessage(
        clinic_id=req.clinic_id, telegram_id=req.telegram_id, channel='telegram',
        message=None, reply="[Passed back to Bot: 'Is there anything else I can help you with?']", status='replied'
    )
    db.add(new_msg)
    db.commit()
    return {"status": "success"}

@app.post("/admin/ocr-mykad")
async def process_mykad_ocr(file: UploadFile = File(...)):
    content = await file.read()
    encoded_image = base64.b64encode(content).decode('utf-8')
    api_key = os.getenv("GOOGLE_VISION_API_KEY")
    json_creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    
    extracted_text = ""
    # 1. Google Cloud Vision API Integration (JSON Credentials OR API Key)
    if json_creds or api_key:
        try:
            # If using pip install google-cloud-vision and JSON file
            from google.cloud import vision
            client = vision.ImageAnnotatorClient()
            image = vision.Image(content=content)
            response = client.text_detection(image=image)
            if response.text_annotations:
                extracted_text = response.text_annotations[0].description
        except ImportError:
            # Fallback to REST API if library isn't installed but key is present
            async with httpx.AsyncClient() as client:
                payload = {
                    "requests": [{
                        "image": {"content": encoded_image},
                        "features": [{"type": "TEXT_DETECTION"}]
                    }]
                }
                res = await client.post(f"https://vision.googleapis.com/v1/images:annotate?key={api_key}", json=payload)
                if res.status_code == 200:
                    data = res.json()
                    if data.get("responses") and "textAnnotations" in data["responses"][0]:
                        extracted_text = data["responses"][0]["textAnnotations"][0]["description"]
    # 2. EasyOCR Fallback (If GCP fails or missing)
    if not extracted_text:
        import easyocr
        import tempfile
        reader = easyocr.Reader(['en', 'ms'], gpu=False) # Suppresses CUDA warning by forcing CPU
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tf:
            tf.write(content)
            tf_path = tf.name
        results = reader.readtext(tf_path)
        extracted_text = "\n".join([text for _, text, _ in results])
        os.remove(tf_path)

    # 3. Regex Extraction Logic for Malaysian IC
    lines = [line.strip() for line in extracted_text.split('\n') if line.strip()]
    ic_num, name, address, gender = "", "", "", "MALE"
    ic_pattern = re.compile(r'\d{6}-\d{2}-\d{4}|\d{12}')
    
    ic_index = -1
    for i, line in enumerate(lines):
        match = ic_pattern.search(line)
        if match:
            raw_ic = match.group(0)
            if len(raw_ic) == 12 and "-" not in raw_ic:
                ic_num = f"{raw_ic[:6]}-{raw_ic[6:8]}-{raw_ic[8:]}"
            else:
                ic_num = raw_ic
            ic_index = i
            last_digit = int(ic_num[-1])
            gender = "FEMALE" if last_digit % 2 == 0 else "MALE"
            break
            
    if ic_index != -1:
        potential_name_lines = []
        for i in range(ic_index + 1, min(ic_index + 4, len(lines))):
            text = lines[i]
            if re.search(r'\d', text) or any(sw in text.upper() for sw in ["ISLAM", "LELAKI", "PEREMPUAN", "WARGANEGARA", "MALAYSIA"]):
                continue
            potential_name_lines.append(re.sub(r'[^A-Z\s]', '', text.upper()).strip())
        if potential_name_lines:
            name = potential_name_lines[0]
            
        address_lines = []
        for i in range(ic_index + 1, len(lines)):
            text = lines[i]
            if any(sw in text.upper() for sw in ["ISLAM", "LELAKI", "PEREMPUAN", "WARGANEGARA", name]): continue
            address_lines.append(text)
            if re.search(r'\d{5}', text): break
        address = ", ".join(address_lines)
        
    return {
        "success": True,
        "data": {
            "ic": ic_num, "name": name, "address": address.upper(),
            "gender": gender, "nationality": "MALAYSIA"
        }
    }

# Store temporary OCR sessions { session_id: { "status": "pending" | "completed", "data": null } }
ocr_sessions = {}

@app.get("/admin/ocr-session/{session_id}/generate")
def generate_ocr_session(session_id: str):
    ocr_sessions[session_id] = {"status": "pending", "data": None}
    return {"status": "success"}

@app.get("/admin/ocr-session/{session_id}")
def check_ocr_session(session_id: str):
    session = ocr_sessions.get(session_id)
    if not session: raise HTTPException(status_code=404)
    if session["status"] == "completed":
        data = session["data"]
        del ocr_sessions[session_id] # Clean up
        return {"status": "completed", "data": data}
    return {"status": "pending"}

@app.post("/register-patient")
def register_patient(data: PatientRegister, db: Session = Depends(get_db)):
    try:
        data_dict = data.dict(exclude_unset=True)
        data_dict['name'] = data_dict['name'].upper() 
        data_dict['ic_passport_number'] = data_dict['ic_passport_number'].upper()
        if data_dict.get('address'): data_dict['address'] = data_dict['address'].upper()
        if data_dict.get('gender'): data_dict['gender'] = data_dict['gender'].upper()
        if data_dict.get('nationality'): data_dict['nationality'] = data_dict['nationality'].upper()
        
        existing = db.query(models.Patient).filter(
            models.Patient.clinic_id == data.clinic_id, 
            models.Patient.ic_passport_number == data_dict['ic_passport_number']
        ).first()
        
        if existing:
            # If the Telegram bot is doing this, we silently update their profile
            if data_dict.get('telegram_id'):
                existing.name = data_dict['name']
                existing.phone = data_dict['phone']
                if 'address' in data_dict: existing.address = data_dict['address']
                if 'gender' in data_dict: existing.gender = data_dict['gender']
                if 'nationality' in data_dict: existing.nationality = data_dict['nationality']
                existing.telegram_id = data_dict['telegram_id']
                db.commit()
                return {"status": "success", "message": "Patient updated via Bot"}
            else:
                # If an Admin is doing this via the website, block the duplicate
                raise HTTPException(status_code=409, detail="This IC/Passport has already been registered in the system.")
        
        new_patient = models.Patient(**data_dict)
        db.add(new_patient)
        db.commit()
        return {"status": "success"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    
# FIND AND REPLACE THE ENTIRE recommend_slots function:
@app.post("/recommend-slots")
def recommend_slots(req: RecommendSlotReq, db: Session = Depends(get_db)):
    from datetime import datetime, timedelta

    try:
        start_date = datetime.strptime(req.base_date, "%Y-%m-%d").date()
    except:
        start_date = datetime.now().date()

    earliest_allowed_dt = datetime.combine(start_date, datetime.min.time())

    # --- Dose 2+: calculate start_date from PREVIOUS dose date + interval ---
    # (dose 1, blood test, others: use base_date = today as-is)
    if req.service_type == 'Vaccine' and req.vaccine_name and req.dose and req.dose not in ['Single Dose', 'Dose 1']:
        vaccine = db.query(models.Vaccine).filter(models.Vaccine.name == req.vaccine_name).first()
        if vaccine:
            same_type_ids = [v.id for v in db.query(models.Vaccine.id).filter(models.Vaccine.type == vaccine.type).all()]

            # FIX: use req.dose (not req.target_dose which doesn't exist)
            try:
                d_lower = req.dose.lower().strip()
                target_num = vaccine.total_doses + 1 if d_lower == 'booster' else int(d_lower.replace('dose ', ''))
            except:
                target_num = 2

            if target_num > 1:
                prev_num = target_num - 1
                prev_dose_name = 'Single Dose' if (prev_num == 1 and vaccine.total_doses == 1) else f'Dose {prev_num}'
                prev_date = None

                # Priority 1: appointment_stages (done in our clinic)
                prev_stage = db.query(models.ApptStage.scheduled_time)\
                    .select_from(models.ApptStage)\
                    .join(models.Appointment, models.ApptStage.appointment_id == models.Appointment.id)\
                    .join(models.Patient, models.Appointment.patient_id == models.Patient.id)\
                    .join(models.AppointmentVaccine, models.Appointment.id == models.AppointmentVaccine.appointment_id)\
                    .filter(
                        models.Patient.ic_passport_number == req.ic,
                        models.AppointmentVaccine.vaccine_id.in_(same_type_ids),
                        models.ApptStage.stage_name == prev_dose_name,
                        models.ApptStage.status.notin_(['canceled', 'no-show'])
                    ).order_by(models.ApptStage.scheduled_time.desc()).first()

                if prev_stage:
                    d = prev_stage[0]
                    prev_date = d.date() if isinstance(d, datetime) else d

                # Priority 2: manual_dates from request payload
                # MUST be checked before DB external records because at the time
                # of recommendation the booking hasn't been saved yet — so
                # external_vaccine_records table doesn't have these dates yet
                if not prev_date and req.manual_dates:
                    d_str = req.manual_dates.get(prev_dose_name)
                    if d_str:
                        try:
                            prev_date = datetime.strptime(d_str, '%Y-%m-%d').date()
                        except:
                            pass

                # Priority 3: external_vaccine_records (previously saved from a
                # past booking cycle — covers rebooking scenarios where the
                # patient has booked before and external records are already in DB)
                if not prev_date:
                    ext = db.query(models.ExternalVaccineRecord).filter(
                        models.ExternalVaccineRecord.patient_ic == req.ic,
                        models.ExternalVaccineRecord.vaccine_id.in_(same_type_ids),
                        models.ExternalVaccineRecord.dose_name == prev_dose_name
                    ).order_by(models.ExternalVaccineRecord.date_taken.desc()).first()
                    if ext:
                        d = ext.date_taken
                        prev_date = d.date() if isinstance(d, datetime) else d

                if prev_date:
                    sched = db.query(models.VaccineDoseSchedule).filter_by(
                        vaccine_id=vaccine.id, dose_number=target_num
                    ).first()
                    if sched and sched.interval_days:
                        min_date = prev_date + timedelta(days=sched.interval_days)
                        min_dt = datetime.combine(min_date, datetime.min.time())
                        if min_dt > earliest_allowed_dt:
                            earliest_allowed_dt = min_dt
                            start_date = min_date  # shift the 8-day search window forward

    # --- Get doctors respecting preference ---
    doctors_query = db.query(models.Doctor).join(models.DoctorClinicAvailability).filter(
        models.DoctorClinicAvailability.clinic_id == req.clinic_id,
        models.DoctorClinicAvailability.status == 'active'
    )
    pref = (req.doctor_pref or 'ANY').strip().upper()
    if pref == 'MALE':
        doctors_query = doctors_query.filter(models.Doctor.gender == 'MALE')
    elif pref == 'FEMALE':
        doctors_query = doctors_query.filter(models.Doctor.gender == 'FEMALE')
    elif pref not in ['ANY', 'SPECIFIC', '']:
        doctors_query = doctors_query.filter(models.Doctor.name == req.doctor_pref)

    doctors = doctors_query.distinct().all()
    if not doctors:
        return {"error": "No doctors found matching criteria."}

    doc_ics = [d.ic_passport_number for d in doctors]

    # --- Calculate TOTAL future workload per doctor ---
    # Uses IDENTICAL query to /scheduling-agent/context star rating so
    # the doctor with most stars (least workload) is always recommended first
    workloads = {d.ic_passport_number: 0 for d in doctors}
    daily_workload: dict = {}  # {(doc_ic, date_str): count} — for least-busy day selection
    end_of_period = datetime.combine(start_date + timedelta(days=8), datetime.max.time())

    future_appts = db.query(models.Appointment.doctor_ic, models.ApptStage.scheduled_time)\
        .join(models.ApptStage, models.Appointment.id == models.ApptStage.appointment_id)\
        .filter(
            models.Appointment.doctor_ic.in_(doc_ics),
            models.Appointment.clinic_id == req.clinic_id,
            models.ApptStage.status.notin_(['canceled', 'no-show']),
            models.ApptStage.scheduled_time >= datetime.now()
        ).all()

    for dic, stime in future_appts:
        if dic:
            workloads[dic] += 1
        if dic and stime and stime <= end_of_period:
            date_key = stime.strftime('%Y-%m-%d')
            key = (dic, date_key)
            daily_workload[key] = daily_workload.get(key, 0) + 1

    # FIX: Sort doctors by total workload ASCENDING so least-busy doctor is
    # always considered first — guarantees recommendation matches star rating
    sorted_doctors = sorted(doctors, key=lambda d: workloads[d.ic_passport_number])

    # --- Generate and collect slots for each doctor in workload order ---
    best = None
    alts = []
    seen_displays: set = set()

    for doc in sorted_doctors:
        doc_slots = []

        for i in range(8):
            curr_date = start_date + timedelta(days=i)
            day_str = curr_date.strftime("%a").lower()
            date_str_key = curr_date.strftime("%Y-%m-%d")

            avails = db.query(models.DoctorClinicAvailability).filter(
                models.DoctorClinicAvailability.doctor_ic == doc.ic_passport_number,
                models.DoctorClinicAvailability.clinic_id == req.clinic_id,
                models.DoctorClinicAvailability.day_of_week == day_str,
                models.DoctorClinicAvailability.status == 'active',
                models.DoctorClinicAvailability.day_of_week != 'none'
            ).all()

            for a in avails:
                t = datetime.combine(curr_date, a.start_time)
                end_t = datetime.combine(curr_date, a.end_time)

                while t + timedelta(minutes=req.duration) <= end_t:
                    if t > datetime.now() and t >= earliest_allowed_dt:
                        # FIX: Range-based conflict check instead of exact time match.
                        # Catches appointments that START within this slot's window,
                        # preventing full slots (like 9:15am) from being suggested.
                        slot_end = t + timedelta(minutes=req.duration)
                        conflict = db.query(models.ApptStage).join(models.Appointment).filter(
                            models.Appointment.doctor_ic == doc.ic_passport_number,
                            models.Appointment.clinic_id == req.clinic_id,
                            models.ApptStage.status.notin_(['canceled', 'no-show']),
                            models.ApptStage.scheduled_time >= t,
                            models.ApptStage.scheduled_time < slot_end
                        ).first()

                        if not conflict:
                            day_load = daily_workload.get((doc.ic_passport_number, date_str_key), 0)
                            doc_slots.append({
                                "doctor": doc.name,
                                "doc_ic": doc.ic_passport_number,
                                "date_str": date_str_key,
                                "time_str": t.strftime("%I:%M %p"),
                                "formatted_time": t.strftime("%H:%M:%S"),
                                "display": f"{curr_date.strftime('%d/%m/%Y')} {t.strftime('%A')} {t.strftime('%I:%M %p')}",
                                "day_load": day_load,
                                "t_val": t
                            })

                    t += timedelta(minutes=req.duration)

        # Sort this doctor's slots: least-busy day first, then earliest time
        doc_slots.sort(key=lambda x: (x["day_load"], x["t_val"]))

        # First slot from least-workload doctor = recommendation
        # First slots from subsequent doctors = alternatives
        for slot in doc_slots:
            if slot["display"] not in seen_displays:
                seen_displays.add(slot["display"])
                if best is None:
                    best = slot
                elif len(alts) < 3:
                    alts.append(slot)

        if best and len(alts) >= 3:
            break

    if not best:
        return {"error": "No available slots within the valid timeframe."}

    log_reasoning = (
        f"Recommended {best['doctor']} on {best['date_str']} at {best['formatted_time']}. "
        f"Total future workload: {workloads[best['doc_ic']]}. "
        f"Alternatives generated: {len(alts)}."
    )
    logging_agent(db, req.clinic_id, "Scheduling Recommendation", log_reasoning)

    return {
        "recommended_doctor": best["doctor"],
        "recommended_slot": best["display"],
        "raw_date": best["date_str"],
        "raw_time": best["time_str"],
        "formatted_time": best["formatted_time"],
        "reasoning": "Recommended for fastest availability with least workload.",
        "alternative_slots": [{
            "doctor": a["doctor"],
            "display": a["display"],
            "date_str": a["date_str"],
            "formatted_time": a["formatted_time"]
        } for a in alts]
    }

class SchedContextReq(BaseModel):
    clinic_id: str
    service_type: str
    vaccine_name: Optional[str] = None
    target_dose: Optional[str] = None
    ic: Optional[str] = None
    doctor_ic: Optional[str] = None
    view_start_date: Optional[str] = None
    view_days: Optional[int] = 42
    manual_dates: Optional[Dict[str, str]] = {}  # FIX: external clinic dates

@app.post("/scheduling-agent/context")
def get_scheduling_context(req: SchedContextReq, db: Session = Depends(get_db)):
    from datetime import datetime, timedelta
    today = datetime.now().date()
    min_allowed_date = today  # default; may be pushed forward by vaccine interval logic

    # --- VACCINE AGENT INTERVAL CHECK ---
    if req.service_type == "Vaccine" and req.vaccine_name and req.target_dose and req.ic:
        vaccine = db.query(models.Vaccine).filter(models.Vaccine.name == req.vaccine_name).first()
        if vaccine:
            same_type_ids = [v.id for v in db.query(models.Vaccine.id).filter(models.Vaccine.type == vaccine.type).all()]
            try:
                d_lower = req.target_dose.lower().strip()
                if d_lower == "booster":
                    target_num = vaccine.total_doses + 1
                elif d_lower in ("single dose", "dose 1"):
                    target_num = 1
                else:
                    target_num = int(d_lower.replace("dose ", ""))
            except:
                target_num = 1

            # FIX: Use PREVIOUS dose's date as base, not the latest stage
            if target_num > 1:
                prev_num = target_num - 1
                prev_dose_name = "Single Dose" if (prev_num == 1 and vaccine.total_doses == 1) else f"Dose {prev_num}"

                prev_stage = db.query(models.ApptStage.scheduled_time)\
                    .select_from(models.ApptStage)\
                    .join(models.Appointment, models.ApptStage.appointment_id == models.Appointment.id)\
                    .join(models.AppointmentVaccine, models.Appointment.id == models.AppointmentVaccine.appointment_id)\
                    .join(models.Patient, models.Appointment.patient_id == models.Patient.id)\
                    .filter(
                        models.Patient.ic_passport_number == req.ic,
                        models.AppointmentVaccine.vaccine_id.in_(same_type_ids),
                        models.ApptStage.stage_name == prev_dose_name,
                        models.ApptStage.status.notin_(['canceled', 'no-show'])
                    ).order_by(models.ApptStage.scheduled_time.desc()).first()

                if prev_stage:
                    d = prev_stage[0]
                    prev_date = d.date() if isinstance(d, datetime) else d

                # Priority 2: manual_dates provided in the request payload
                # (checked before DB external records — booking not yet saved at this point)
                if not prev_date and req.manual_dates:
                    d_str = req.manual_dates.get(prev_dose_name)
                    if d_str:
                        try:
                            prev_date = datetime.strptime(d_str, '%Y-%m-%d').date()
                        except:
                            pass

                # Priority 3: external_vaccine_records (saved from a previous booking cycle)
                if not prev_date:
                    ext = db.query(models.ExternalVaccineRecord).filter(
                        models.ExternalVaccineRecord.patient_ic == req.ic,
                        models.ExternalVaccineRecord.vaccine_id.in_(same_type_ids),
                        models.ExternalVaccineRecord.dose_name == prev_dose_name
                    ).order_by(models.ExternalVaccineRecord.date_taken.desc()).first()
                    if ext:
                        d = ext.date_taken
                        prev_date = d.date() if isinstance(d, datetime) else d

                if prev_date:
                    sched = db.query(models.VaccineDoseSchedule).filter_by(
                        vaccine_id=vaccine.id, dose_number=target_num
                    ).first()
                    if sched and sched.interval_days:
                        min_allowed_date = prev_date + timedelta(days=sched.interval_days)

    # --- SCHEDULING AGENT: DOCTOR RATING (sorted by lowest workload = best) ---
    docs = db.query(models.Doctor)\
        .join(models.DoctorClinicAvailability,
              models.Doctor.ic_passport_number == models.DoctorClinicAvailability.doctor_ic)\
        .filter(
            models.DoctorClinicAvailability.clinic_id == req.clinic_id,
            models.DoctorClinicAvailability.status == 'active'
        ).distinct().all()

    doc_stats = []
    for d in docs:
        count = db.query(models.ApptStage)\
            .join(models.Appointment)\
            .filter(
                models.Appointment.doctor_ic == d.ic_passport_number,
                models.Appointment.clinic_id == req.clinic_id,
                models.ApptStage.status.notin_(['canceled', 'no-show']),
                models.ApptStage.scheduled_time >= datetime.now()
            ).count()
        doc_stats.append({"ic": d.ic_passport_number, "name": d.name, "count": count})

    doc_stats.sort(key=lambda x: x["count"])
    doc_res = []
    for idx, d in enumerate(doc_stats):
        stars = "⭐⭐⭐" if idx == 0 else ("⭐⭐" if idx == 1 else "⭐")
        doc_res.append({"ic": d["ic"], "name": f"Dr. {d['name']}", "label": stars})

    # --- SCHEDULING AGENT: 30-DAY WORKLOAD COLORS (per selected doctor) ---
    #
    # Color logic:
    #   Grey   → doctor has no availability (not working) on that day_of_week
    #   Red    → doctor has >= 10 upcoming appointments that day (overloaded)
    #   Yellow → doctor has 5-9 appointments that day (medium)
    #   Green  → doctor has 0-4 appointments that day (low load)
    #
    # If no specific doctor is selected we fall back to clinic-wide counts.

    target_doc_ic = req.doctor_ic  # may be None / empty

    # Pre-fetch the working days for the target doctor (or all clinic doctors)
    if target_doc_ic:
        avail_rows = db.query(models.DoctorClinicAvailability).filter(
            models.DoctorClinicAvailability.doctor_ic == target_doc_ic,
            models.DoctorClinicAvailability.clinic_id == req.clinic_id,
            models.DoctorClinicAvailability.status == 'active'
        ).all()
        working_days = set(row.day_of_week for row in avail_rows)  # e.g. {"mon","tue","wed"}
    else:
        # Any doctor works → every day that at least one doctor is available
        avail_rows = db.query(models.DoctorClinicAvailability).filter(
            models.DoctorClinicAvailability.clinic_id == req.clinic_id,
            models.DoctorClinicAvailability.status == 'active'
        ).all()
        working_days = set(row.day_of_week for row in avail_rows)

    # Determine the start date for the calendar view
    if req.view_start_date:
        try:
            view_start = datetime.strptime(req.view_start_date, "%Y-%m-%d").date()
        except:
            view_start = today
    else:
        view_start = today

    view_days_count = req.view_days or 42

    dates_res = []
    for day_offset in range(view_days_count):
        target_date = view_start + timedelta(days=day_offset)
        day_str = target_date.strftime("%a").lower()  # "mon", "tue", …

        # Past dates are always disabled
        if target_date < today:
            dates_res.append({"date": target_date.isoformat(), "status": "Grey", "disabled": True})
            continue

        # Dates before vaccine minimum interval are disabled
        if target_date < min_allowed_date:
            dates_res.append({"date": target_date.isoformat(), "status": "Grey", "disabled": True})
            continue

        # Doctor not working this day_of_week → Grey + disabled
        if day_str not in working_days:
            dates_res.append({"date": target_date.isoformat(), "status": "Grey", "disabled": True})
            continue

        # Count upcoming scheduled appointments for this date
        try:
            day_start = datetime.combine(target_date, datetime.min.time())
            day_end = datetime.combine(target_date, datetime.max.time())

            appt_query = db.query(models.ApptStage)\
                .join(models.Appointment, models.ApptStage.appointment_id == models.Appointment.id)\
                .filter(
                    models.Appointment.clinic_id == req.clinic_id,
                    models.ApptStage.scheduled_time >= day_start,
                    models.ApptStage.scheduled_time <= day_end,
                    models.ApptStage.status.notin_(['canceled', 'no-show'])
                )
            if target_doc_ic:
                appt_query = appt_query.filter(models.Appointment.doctor_ic == target_doc_ic)

            day_appt_count = appt_query.count()
        except Exception:
            day_appt_count = 0

        # Workload color thresholds (per-doctor view)
        if target_doc_ic:
            if day_appt_count >= 10:
                status = "Red"
            elif day_appt_count >= 5:
                status = "Yellow"
            else:
                status = "Green"
        else:
            num_docs = max(len(docs), 1)
            if day_appt_count >= 10 * num_docs:
                status = "Red"
            elif day_appt_count >= 5 * num_docs:
                status = "Yellow"
            else:
                status = "Green"

        dates_res.append({"date": target_date.isoformat(), "status": status, "disabled": False})

    return {"doctors": doc_res, "dates": dates_res}

@app.post("/check-vaccine-history")
def check_vaccine_history(req: VaccineHistoryCheckReq, db: Session = Depends(get_db)):
    vaccine = db.query(models.Vaccine).filter(models.Vaccine.name == req.vaccine_name).first()
    if not vaccine: return {"missing_doses": []}

    # Dynamically determine required previous doses
    required_doses = []
    if req.target_dose.startswith("Dose "):
        try:
            d_num = int(req.target_dose.split(" ")[1])
            required_doses = [f"Dose {i}" for i in range(1, d_num)]
        except: pass
    elif req.target_dose == "Booster":
        if vaccine.total_doses == 1:
            required_doses = ["Single Dose"]
        else:
            required_doses = [f"Dose {i}" for i in range(1, vaccine.total_doses + 1)]

    if not required_doses: return {"missing_doses": []}

    # UPGRADED: Explicit select_from to prevent SQLAlchemy Join crashes
    past_stages = db.query(models.ApptStage.stage_name)\
        .select_from(models.ApptStage)\
        .join(models.Appointment, models.ApptStage.appointment_id == models.Appointment.id)\
        .join(models.Patient, models.Appointment.patient_id == models.Patient.id)\
        .join(models.AppointmentVaccine, models.Appointment.id == models.AppointmentVaccine.appointment_id)\
        .filter(
            models.Patient.ic_passport_number == req.ic,
            models.AppointmentVaccine.vaccine_id == vaccine.id,
            models.ApptStage.status != 'canceled'
        ).all()

    found_doses = {s[0] for s in past_stages}
    
    # Identify what is missing from the database
    missing = [d for d in required_doses if d not in found_doses]
    return {"missing_doses": missing}

@app.post("/validate-vaccine-booking")
def validate_vaccine_booking(req: ValidateVaccineDateReq, db: Session = Depends(get_db)):
    vaccine = db.query(models.Vaccine).filter(models.Vaccine.name == req.vaccine_name).first()
    if not vaccine: return {"is_valid": True}

    same_type_vaccines = db.query(models.Vaccine).filter(models.Vaccine.type == vaccine.type).all()
    same_type_ids = [v.id for v in same_type_vaccines]

    # Gather existing history across ALL vaccines of the same type in the clinic
    past_stages_query = db.query(models.ApptStage.stage_name, models.ApptStage.scheduled_time, models.ApptStage.status, models.AppointmentVaccine.vaccine_id, models.ApptStage.id)\
        .select_from(models.ApptStage)\
        .join(models.Appointment, models.ApptStage.appointment_id == models.Appointment.id)\
        .join(models.Patient, models.Appointment.patient_id == models.Patient.id)\
        .join(models.AppointmentVaccine, models.Appointment.id == models.AppointmentVaccine.appointment_id)\
        .filter(
            models.Patient.ic_passport_number == req.ic,
            models.AppointmentVaccine.vaccine_id.in_(same_type_ids),
            models.ApptStage.status.notin_(['canceled', 'no-show'])
        )

    # Exclude the appointment currently being edited so it doesn't trigger duplicate errors against itself
    if req.exclude_stage_id:
        past_stages_query = past_stages_query.filter(models.ApptStage.id != req.exclude_stage_id)

    past_stages = past_stages_query.order_by(models.ApptStage.scheduled_time.asc()).all()
        
    # --- Fetch External Records ---
    external_records = db.query(models.ExternalVaccineRecord).filter(
        models.ExternalVaccineRecord.patient_ic == req.ic,
        models.ExternalVaccineRecord.vaccine_id.in_(same_type_ids)
    ).all()

    completed_doses = []
    scheduled_doses = []
    missed_doses = [] # <--- ADD THIS LINE BACK HERE

    def get_dose_num(name):
        if not name: return 0
        name = name.lower()
        if 'single' in name: return 1
        if 'booster' in name: return vaccine.total_doses + 1
        if 'dose ' in name:
            try: return int(name.split(" ")[1])
            except: return 0
        return 0

    def get_dose_name(num):
        if num == vaccine.total_doses + 1 and vaccine.has_booster: return "Booster"
        if vaccine.total_doses == 1 and num == 1: return "Single Dose"
        return f"Dose {num}"

    all_dates = {}
    
    for s in past_stages:
        stage_name, scheduled_time, status, v_id = s
        dt = scheduled_time.date() if isinstance(scheduled_time, datetime) else scheduled_time
        d_num = get_dose_num(stage_name)
        if d_num == 0: continue
        
        if status == 'completed': 
            completed_doses.append({"num": d_num, "date": dt, "name": stage_name, "v_id": v_id})
            all_dates[stage_name] = dt
        elif status == 'scheduled': 
            scheduled_doses.append({"num": d_num, "date": dt, "name": stage_name, "v_id": v_id})
            all_dates[stage_name] = dt # FIX: Save scheduled dates so interval validation can find them!
        elif status in ['canceled', 'no-show']: missed_doses.append(d_num)

    for ext in external_records:
        dt = ext.date_taken.date() if isinstance(ext.date_taken, datetime) else ext.date_taken
        d_num = get_dose_num(ext.dose_name)
        if d_num > 0: 
            completed_doses.append({"num": d_num, "date": dt, "name": ext.dose_name, "v_id": ext.vaccine_id})
            all_dates[ext.dose_name] = dt

    for d_name, d_str in req.manual_dates.items():
        try: 
            dt = datetime.strptime(d_str, "%Y-%m-%d").date()
            d_num = get_dose_num(d_name)
            if d_num > 0: 
                completed_doses.append({"num": d_num, "date": dt, "name": d_name, "v_id": vaccine.id})
                all_dates[d_name] = dt
        except: pass

    completed_doses.sort(key=lambda x: x['num'])
    scheduled_doses.sort(key=lambda x: x['num'])
    
    highest_comp = completed_doses[-1] if completed_doses else None
    
    # FIX: Calculate highest overall dose (completed + scheduled)
    all_doses_sorted = sorted(completed_doses + scheduled_doses, key=lambda x: x['num'])
    highest_overall = all_doses_sorted[-1] if all_doses_sorted else None
    
    # 1. Strict Brand Continuation Check
    if highest_overall and highest_overall['num'] < vaccine.total_doses and highest_overall['v_id'] != vaccine.id:
        active_vac = next((v for v in same_type_vaccines if v.id == highest_overall['v_id']), None)
        reason = f"You started your cycle with {active_vac.name}. You must complete your cycle with {active_vac.name} before switching brands."
        return {"is_valid": False, "reason": reason}

    try:
        req_dt = datetime.strptime(req.requested_time, "%Y-%m-%d %H:%M:%S")
        req_date = req_dt.date()
    except:
        return {"is_valid": False, "reason": "Invalid requested time format."}

    # Auto-Determine Target Dose (Using highest overall, not just completed)
    target_num = highest_overall['num'] + 1 if highest_overall else 1
    if target_num > vaccine.total_doses + (1 if vaccine.has_booster else 0): target_num = 1
    target_name = get_dose_name(target_num)

    # 2. Cancelled/No-Show Handling (External Request)
    if target_num in missed_doses and target_name not in all_dates:
        # FIX: Find the FIRST missed dose after last completed
        first_missed_after_completed = min(
            (n for n in missed_doses if n > (highest_comp['num'] if highest_comp else 0)),
            default=None
        )
        if first_missed_after_completed is not None and target_num == first_missed_after_completed:
            # Direct rebook of the first missed/no-show dose — allow it
            # (It was an internal no-show or cascade-cancel, not an external skip)
            pass  # proceed to interval validation below
        else:
            # Patient is trying to skip ahead past a missed dose — ask if done externally
            missed_name = get_dose_name(first_missed_after_completed) if first_missed_after_completed else target_name
            reason = f"We found an incomplete vaccine series. Have you already received {vaccine.name} {missed_name} at another clinic?"
            return {"is_valid": False, "ask_external_yes_no": missed_name, "reason": reason}

    is_completed_series = True if highest_comp and highest_comp['num'] >= vaccine.total_doses else False

    # 3. Repeat Vaccination Validation
    if is_completed_series and target_num == 1:
        if not vaccine.allow_repeat_series:
            return {"is_valid": False, "reason": f"You have already completed the {vaccine.name} series. This vaccine cannot be repeated."}
        elif vaccine.repeat_interval_days is not None:
            eligible_date = highest_comp['date'] + timedelta(days=vaccine.repeat_interval_days)
            if req_date < eligible_date:
                return {"is_valid": False, "reason": f"This vaccine may only be repeated after {eligible_date.strftime('%Y-%m-%d')}."}

    # 4. Existing Scheduled Dose Check — skip if we're editing that exact stage
    for sched in scheduled_doses:
        if sched['num'] == target_num:
            # Allow if the caller is editing this specific existing booking
            if req.exclude_stage_id:
                continue
            return {"is_valid": False, "reason": f"You already have a booking for {vaccine.name} {sched['name']} on {sched['date'].strftime('%Y-%m-%d')}."}

    # 5. Interrupted Vaccine Validation
    min_allowed_date_str = None
    
    # Interruption logic checks gaps between physically COMPLETED doses
    if highest_comp and target_num > 1:
        if vaccine.restart_if_interrupted and vaccine.interruption_restart_days is not None:
            max_allowed_date = highest_comp['date'] + timedelta(days=vaccine.interruption_restart_days)
            if req_date > max_allowed_date:
                return {"is_valid": False, "reason": "Your previous vaccine series has expired and must be restarted. Please select Dose 1 instead."}

    # Interval logic checks dates spacing between ANY existing doses (completed OR scheduled)
    if highest_overall and target_num > 1:
        schedules = {s.dose_number: s.interval_days for s in db.query(models.VaccineDoseSchedule).filter_by(vaccine_id=vaccine.id).all()}
        interval_days = schedules.get(target_num)
        if interval_days is not None:
            prev_name = get_dose_name(target_num - 1)
            if prev_name in all_dates:
                min_allowed_date = all_dates[prev_name] + timedelta(days=interval_days)
                min_allowed_date_str = min_allowed_date.strftime('%Y-%m-%d')
                if req_date < min_allowed_date:
                    return {"is_valid": False, "reason": f"Based on dependency rules, {target_name} must be at least {interval_days} days after {prev_name}. Earliest allowed date: {min_allowed_date_str}."}

    return {"is_valid": True, "target_dose": target_name, "min_allowed_date": min_allowed_date_str}

@app.get("/patients/{ic}/next-vaccine-dose/{vaccine_name}")
def get_next_vaccine_dose(ic: str, vaccine_name: str, db: Session = Depends(get_db)):
    from datetime import datetime, timedelta

    vaccine = db.query(models.Vaccine).filter(models.Vaccine.name == vaccine_name).first()
    if not vaccine:
        return {"next_dose": "Single Dose", "is_brand_switch": False, "active_brand": None,
                "no_history": True, "all_dose_options": ["Single Dose"],
                "type_disabled": False, "disable_reason": None}

    same_type_vaccines = db.query(models.Vaccine).filter(models.Vaccine.type == vaccine.type).all()
    same_type_ids = [v.id for v in same_type_vaccines]

    def get_dose_num(name, total_doses):
        if not name: return 0
        n = name.lower()
        if 'single' in n: return 1
        if 'booster' in n: return total_doses + 1
        if 'dose ' in n:
            try: return int(n.split(" ")[1])
            except: return 0
        return 0
    
    def get_dose_name(num):
        if num == vaccine.total_doses + 1 and vaccine.has_booster:
            return "Booster"
        if vaccine.total_doses == 1 and num == 1:
            return "Single Dose"
        return f"Dose {num}"

    def all_dose_options_for(vac):
        opts = []
        if vac.total_doses == 1:
            opts.append("Single Dose")
        else:
            for i in range(1, vac.total_doses + 1):
                opts.append(f"Dose {i}")
        if vac.has_booster:
            opts.append("Booster")
        return opts

    # Fetch ALL clinic history (including no-show/cancelled) for full analysis
    rows = db.query(
        models.ApptStage.stage_name, models.ApptStage.status,
        models.ApptStage.scheduled_time, models.AppointmentVaccine.vaccine_id
    ).select_from(models.ApptStage)\
     .join(models.Appointment, models.ApptStage.appointment_id == models.Appointment.id)\
     .join(models.Patient, models.Appointment.patient_id == models.Patient.id)\
     .join(models.AppointmentVaccine, models.Appointment.id == models.AppointmentVaccine.appointment_id)\
     .filter(
         models.Patient.ic_passport_number == ic,
         models.AppointmentVaccine.vaccine_id.in_(same_type_ids)
     ).order_by(models.ApptStage.scheduled_time.asc()).all()

    external_records = db.query(models.ExternalVaccineRecord).filter(
        models.ExternalVaccineRecord.patient_ic == ic,
        models.ExternalVaccineRecord.vaccine_id.in_(same_type_ids)
    ).all()

    # Build dose_map: dose_num -> most recent {status, date, vaccine_id}
    dose_map: dict = {}
    for stage_name, status, stime, v_id in rows:
        vac_ref = next((v for v in same_type_vaccines if v.id == v_id), vaccine)
        num = get_dose_num(stage_name, vac_ref.total_doses)
        if num <= 0: continue
        existing = dose_map.get(num)
        if existing is None or (stime and existing['date'] and stime > existing['date']):
            dose_map[num] = {'status': status, 'date': stime, 'vaccine_id': v_id}

    # External records fill in gaps only (do not overwrite clinic records)
    for ext in external_records:
        vac_ref = next((v for v in same_type_vaccines if v.id == ext.vaccine_id), vaccine)
        num = get_dose_num(ext.dose_name, vac_ref.total_doses)
        if num > 0 and num not in dose_map:
            dose_map[num] = {'status': 'completed', 'date': ext.date_taken, 'vaccine_id': ext.vaccine_id}

    # --- Brand switch check ---
    active_brand_id = None
    highest_valid_num = 0
    for num, info in dose_map.items():
        if info['status'] in ['completed', 'scheduled'] and num > highest_valid_num:
            highest_valid_num = num
            active_brand_id = info['vaccine_id']

    if active_brand_id and active_brand_id != vaccine.id:
        active_vac = next((v for v in same_type_vaccines if v.id == active_brand_id), None)
        if active_vac and highest_valid_num < active_vac.total_doses:
            return {"next_dose": None, "is_brand_switch": True, "active_brand": active_vac.name,
                    "no_history": False, "all_dose_options": [],
                    "type_disabled": False, "disable_reason": None}

    # --- No history at all ---
    if not dose_map:
        return {"next_dose": ("Dose 1" if vaccine.total_doses > 1 else "Single Dose"),
                "is_brand_switch": False, "active_brand": None,
                "no_history": True, "all_dose_options": all_dose_options_for(vaccine),
                "type_disabled": False, "disable_reason": None}

    # --- Full series completion check ---
    all_required_nums = list(range(1, vaccine.total_doses + 1))
    if vaccine.has_booster:
        all_required_nums.append(vaccine.total_doses + 1)
    completed_set = {n for n, info in dose_map.items() if info['status'] in ['completed', 'scheduled']}
    full_series_done = all(n in completed_set for n in all_required_nums)

    if full_series_done:
        if not vaccine.allow_repeat_series:
            return {"next_dose": None, "is_brand_switch": False, "active_brand": None,
                    "no_history": False, "all_dose_options": [],
                    "type_disabled": True,
                    "disable_reason": "This vaccine series can only be taken once."}

        # allow_repeat_series=True: check repeat_interval_days
        last_dose_num = max(all_required_nums)
        last_info = dose_map.get(last_dose_num)
        last_date = None
        if last_info and last_info['date']:
            d = last_info['date']
            last_date = d.date() if isinstance(d, datetime) else d

        if vaccine.repeat_interval_days and last_date:
            repeat_from = last_date + timedelta(days=vaccine.repeat_interval_days)
            if datetime.now().date() < repeat_from:
                return {"next_dose": None, "is_brand_switch": False, "active_brand": None,
                        "no_history": False, "all_dose_options": [],
                        "type_disabled": True,
                        "disable_reason": f"Repeat series available from {repeat_from.strftime('%d %b %Y')}."}

        # Repeat allowed and interval passed → fresh series
        return {"next_dose": ("Dose 1" if vaccine.total_doses > 1 else "Single Dose"),
                "is_brand_switch": False, "active_brand": None,
                "no_history": True, "all_dose_options": all_dose_options_for(vaccine),
                "type_disabled": False, "disable_reason": None}

    # --- Incomplete series: handle no-show/cancelled latest dose ---
    highest_completed_num = 0
    last_completed_date = None
    for num in sorted(dose_map.keys(), reverse=True):
        info = dose_map[num]
        if info['status'] == 'completed':
            highest_completed_num = num
            last_completed_date = info['date']
            break

    first_interrupted_num = 0
    for num in sorted(dose_map.keys()):  # ascending — lowest first
        if num > highest_completed_num and dose_map[num]['status'] in ['no-show', 'canceled']:
            first_interrupted_num = num
            break

    if first_interrupted_num > highest_completed_num:
        # If no dose was ever completed (entire series cancelled/no-show from dose 1)
        if highest_completed_num == 0:
            first_missed = min(
                (n for n in dose_map if dose_map[n]['status'] in ('canceled', 'no-show')), default=1
            )
            dose_name = get_dose_name(first_missed)
            return {"next_dose": dose_name,
                    "is_brand_switch": False, "active_brand": None,
                    "no_history": first_missed == 1,
                    "all_dose_options": all_dose_options_for(vaccine) if first_missed == 1 else [],
                    "type_disabled": False, "disable_reason": None}
        # First missed dose found — check interruption restart condition
        should_restart = False
        if vaccine.restart_if_interrupted and vaccine.interruption_restart_days and last_completed_date:
            lcd = last_completed_date.date() if isinstance(last_completed_date, datetime) else last_completed_date
            if datetime.now().date() > lcd + timedelta(days=vaccine.interruption_restart_days):
                should_restart = True

        next_num = 1 if should_restart else first_interrupted_num  # FIX: use first, not highest
        if next_num == vaccine.total_doses + 1 and vaccine.has_booster:
            next_dose = "Booster"
        elif vaccine.total_doses == 1:
            next_dose = "Single Dose"
        else:
            next_dose = f"Dose {next_num}"

        return {"next_dose": next_dose, "is_brand_switch": False, "active_brand": None,
                "no_history": False, "all_dose_options": [],
                "type_disabled": False, "disable_reason": None}

    # --- Normal continuation: next dose after highest valid ---
    next_num = highest_valid_num + 1
    max_possible = vaccine.total_doses + (1 if vaccine.has_booster else 0)
    if next_num > max_possible: next_num = 1  # safety fallback

    if next_num == vaccine.total_doses + 1 and vaccine.has_booster:
        next_dose = "Booster"
    elif vaccine.total_doses == 1 and next_num == 1:
        next_dose = "Single Dose"
    else:
        next_dose = f"Dose {next_num}"

    return {"next_dose": next_dose, "is_brand_switch": False, "active_brand": None,
            "no_history": False, "all_dose_options": [],
            "type_disabled": False, "disable_reason": None}