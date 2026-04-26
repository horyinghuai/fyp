import os
import httpx
import re
import asyncio
import tempfile
import easyocr
import datetime as dt
import logging
import difflib
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, CommandHandler, ContextTypes, 
    CallbackQueryHandler, ConversationHandler, MessageHandler, filters, InlineQueryHandler
)

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO
)
logger = logging.getLogger(__name__)

load_dotenv()
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
API_BASE = "http://127.0.0.1:8000"
CLINIC_ID = os.getenv("CLINIC_ID")

if not TOKEN:
    logger.error("CRITICAL ERROR: TELEGRAM_BOT_TOKEN is missing in the .env file! The bot cannot start.")
    exit(1)

COUNTRIES_LIST = [
    "MALAYSIA", "AFGHANISTAN", "ALBANIA", "ALGERIA", "ANDORRA", "ANGOLA", "ARGENTINA", "ARMENIA", "AUSTRALIA", 
    "AUSTRIA", "AZERBAIJAN", "BAHAMAS", "BAHRAIN", "BANGLADESH", "BARBADOS", "BELARUS", "BELGIUM", "BELIZE", 
    "BENIN", "BHUTAN", "BOLIVIA", "BOSNIA AND HERZEGOVINA", "BOTSWANA", "BRAZIL", "BRUNEI", "BULGARIA", 
    "BURKINA FASO", "BURUNDI", "CAMBODIA", "CAMEROON", "CANADA", "CENTRAL AFRICAN REPUBLIC", "CHAD", "CHILE", 
    "CHINA", "COLOMBIA", "COMOROS", "COSTA RICA", "CROATIA", "CUBA", "CYPRUS", "CZECH REPUBLIC", "DENMARK", 
    "DJIBOUTI", "DOMINICAN REPUBLIC", "EAST TIMOR", "ECUADOR", "EGYPT", "EL SALVADOR", "EQUATORIAL GUINEA", 
    "ERITREA", "ESTONIA", "ETHIOPIA", "FIJI", "FINLAND", "FRANCE", "GABON", "GAMBIA", "GEORGIA", "GERMANY", 
    "GHANA", "GREECE", "GRENADA", "GUATEMALA", "GUINEA", "GUYANA", "HAITI", "HONDURAS", "HUNGARY", "ICELAND", 
    "INDIA", "INDONESIA", "IRAN", "IRAQ", "IRELAND", "ISRAEL", "ITALY", "JAMAICA", "JAPAN", "JORDAN", 
    "KAZAKHSTAN", "KENYA", "KIRIBATI", "KUWAIT", "KYRGYZSTAN", "LAOS", "LATVIA", "LEBANON", "LESOTHO", 
    "LIBERIA", "LIBYA", "LIECHTENSTEIN", "LITHUANIA", "LUXEMBOURG", "MACEDONIA", "MADAGASCAR", "MALAWI", 
    "MALDIVES", "MALI", "MALTA", "MAURITANIA", "MAURITIUS", "MEXICO", "MICRONESIA", "MOLDOVA", "MONACO", 
    "MONGOLIA", "MONTENEGRO", "MOROCCO", "MOZAMBIQUE", "MYANMAR", "NAMIBIA", "NAURU", "NEPAL", "NETHERLANDS", 
    "NEW ZEALAND", "NICARAGUA", "NIGER", "NIGERIA", "NORWAY", "OMAN", "PAKISTAN", "PALAU", "PALESTINE", "PANAMA", 
    "PAPUA NEW GUINEA", "PARAGUAY", "PERU", "PHILIPPINES", "POLAND", "PORTUGAL", "QATAR", "ROMANIA", 
    "RUSSIA", "RWANDA", "SAINT KITTS AND NEVIS", "SAINT LUCIA", "SAINT VINCENT", "SAMOA", "SAN MARINO", 
    "SAO TOME", "SAUDI ARABIA", "SENEGAL", "SERBIA", "SEYCHELLES", "SIERRA LEONE", "SINGAPORE", "SLOVAKIA", 
    "SLOVENIA", "SOLOMON ISLANDS", "SOMALIA", "SOUTH AFRICA", "SOUTH KOREA", "SPAIN", "SRI LANKA", "SUDAN", 
    "SURINAME", "SWAZILAND", "SWEDEN", "SWITZERLAND", "SYRIA", "TAIWAN", "TAJIKISTAN", "TANZANIA", "THAILAND", 
    "TOGO", "TONGA", "TRINIDAD AND TOBAGO", "TUNISIA", "TURKEY", "TURKMENISTAN", "TUVALU", "UGANDA", 
    "UKRAINE", "UNITED ARAB EMIRATES", "UNITED KINGDOM", "UNITED STATES", "URUGUAY", "UZBEKISTAN", "VANUATU", 
    "VATICAN CITY", "VENEZUELA", "VIETNAM", "YEMEN", "ZAMBIA", "ZIMBABWE"
]

ocr_reader = None
def get_ocr_reader():
    global ocr_reader
    if ocr_reader is None: 
        logger.info("Loading EasyOCR Model... this may take a moment.")
        ocr_reader = easyocr.Reader(['en', 'ms'])
    return ocr_reader

NAT_CHOICE, MY_METHOD_CHOICE, UPLOAD_IC, MAN_ID_CHECK, MAN_NAME, MAN_GENDER, MAN_NAT, MAN_NAT_CONFIRM, MAN_ADDRESS, MAN_PHONE, CONFIRM_PROFILE, EDIT_PROFILE_MENU, EDIT_SPECIFIC_FIELD, SERVICE, V_TYPE, V_SELECT, V_DOSE, BT_FLOW, DOC_PREF, DOC_SELECT, BOOK_DATE_TIME, CONFIRM_BOOK, EDIT_BOOKING_MENU, FINAL_HELP, CANCEL_SELECT, CANCEL_REASON, BASIC_CONFIRM = range(27)

async def generate_date_picker(service, doctor_pref, is_editing=False):
    duration = 15 if service == 'Vaccine' else 30
    async with httpx.AsyncClient() as client:
        try:
            res = await client.post(f"{API_BASE}/available-dates", json={"clinic_id": CLINIC_ID, "duration": duration, "doctor_pref": doctor_pref}, timeout=10.0)
            valid_dates = res.json() if res.status_code == 200 else []
        except Exception as e:
            logger.error(f"Error fetching available dates: {e}")
            valid_dates = []
        
    keyboard = []
    row = []
    for d_str in valid_dates:
        d_obj = dt.datetime.strptime(d_str, "%Y-%m-%d")
        row.append(InlineKeyboardButton(d_obj.strftime("%d %b %Y"), callback_data=f"date_{d_str}"))
        if len(row) == 2:
            keyboard.append(row)
            row = []
    if row: keyboard.append(row)
    
    if is_editing:
        keyboard.append([InlineKeyboardButton("🔙 Back to Edit Menu", callback_data="back_edit_menu")])
    else:
        keyboard.append([InlineKeyboardButton("🔙 Back to Preferences", callback_data="back_doc_pref")])
        
    return InlineKeyboardMarkup(keyboard)

async def generate_time_picker(service, date_str, doctor_pref):
    duration = 15 if service == 'Vaccine' else 30
    async with httpx.AsyncClient() as client:
        try:
            res = await client.post(f"{API_BASE}/available-times", json={"clinic_id": CLINIC_ID, "date": date_str, "duration": duration, "doctor_pref": doctor_pref}, timeout=10.0)
            data = res.json() if res.status_code == 200 else {}
        except Exception as e:
            logger.error(f"Error fetching available times: {e}")
            data = {}
        
    valid_times = data.get("times", [])
    
    keyboard = []
    row = []
    for t_str in valid_times:
        row.append(InlineKeyboardButton(t_str[:5], callback_data=f"time_{t_str}"))
        if len(row) == 3:
            keyboard.append(row)
            row = []
    if row: keyboard.append(row)
    keyboard.append([InlineKeyboardButton("🔙 Back to Date Selection", callback_data="back_date")])
    
    return InlineKeyboardMarkup(keyboard)

def extract_ic_info(image_path: str):
    reader = get_ocr_reader()
    results = reader.readtext(image_path)
    if not results: return None, None, None, None, None
    results = sorted(results, key=lambda r: r[0][0][1])
    ic_num = None
    ic_index = -1
    ic_pattern = re.compile(r'\d{6}-\d{2}-\d{4}|\d{12}')
    cleaned_results = [(bbox, text.upper().strip(), prob) for bbox, text, prob in results]

    for i, (bbox, text, prob) in enumerate(cleaned_results):
        match = ic_pattern.search(text)
        if match:
            ic_num = match.group(0)
            if len(ic_num) == 12 and "-" not in ic_num:
                ic_num = f"{ic_num[:6]}-{ic_num[6:8]}-{ic_num[8:]}"
            ic_index = i
            break

    if not ic_num: return None, None, None, None, None
    last_digit = int(ic_num[-1])
    gender = "FEMALE" if last_digit % 2 == 0 else "MALE"
    nationality = "MALAYSIA"
    
    name_lines = []
    address_start_idx = ic_index + 1
    stop_words = ["ISLAM", "LELAKI", "PEREMPUAN", "BUDDHA", "HINDU", "KRISTIAN", "WARGANEGARA", "WARGA", "NEGARA"]
    
    for i in range(ic_index + 1, min(ic_index + 4, len(cleaned_results))):
        text = cleaned_results[i][1]
        if re.search(r'\d', text) or any(sw in text for sw in stop_words):
            break
        name_lines.append(re.sub(r'[^A-Z\s]', '', text).strip())
        address_start_idx = i + 1
        
    name = " ".join(name_lines).strip() if name_lines else "UNKNOWN"

    address_lines = []
    for i in range(address_start_idx, len(cleaned_results)):
        text = cleaned_results[i][1]
        if any(sw in text for sw in stop_words) or len(text) < 3: continue
        address_lines.append(text)
        
    address = ", ".join(address_lines) if address_lines else "UNKNOWN"
    return name, ic_num, address, gender, nationality

def clean_bot_username(text: str) -> str:
    cleaned = re.sub(r'^(via\s+)?@[A-Za-z0-9_]+\s*', '', text, flags=re.IGNORECASE)
    return cleaned.strip().upper()

async def cancel_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    msg = "Please enter your IC or Passport Number to find your appointments:"
    if update.message: await update.message.reply_text(msg)
    else: await update.callback_query.message.reply_text(msg)
    return CANCEL_SELECT

async def cancel_select_logic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ic = clean_bot_username(update.message.text)
    
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(f"{API_BASE}/patient/{CLINIC_ID}/appointments/{ic}", timeout=5.0)
            if res.status_code != 200:
                await update.message.reply_text("Could not find any upcoming appointments for this ID. Type /cancel to try again or /start to book.")
                return ConversationHandler.END
            appts = res.json()
        except Exception as e:
            logger.error(f"Error fetching appointments: {e}")
            await update.message.reply_text("Server error. Please try again later.")
            return ConversationHandler.END

    if not appts:
        await update.message.reply_text("You have no upcoming appointments to cancel.")
        return ConversationHandler.END

    btns = []
    for a in appts:
        service_title = a.get("service", "Consultation")
        details = a.get("details", {})
        item_text = details.get("items", [])[0] if details.get("items") else service_title
        btn_text = f"{a['date']} {a['time'][:5]} - {item_text}"
        btns.append([InlineKeyboardButton(btn_text, callback_data=f"can_{a['appt_id']}")])

    btns.append([InlineKeyboardButton("❌ Nevermind, go back", callback_data="can_abort")])
    await update.message.reply_text("Select the appointment you wish to cancel:", reply_markup=InlineKeyboardMarkup(btns))
    return CANCEL_REASON

async def cancel_reason_logic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    
    if query:
        await query.answer()
        data = query.data
        
        if data == "can_abort":
            await query.edit_message_text("Cancellation aborted.")
            return ConversationHandler.END
            
        if data.startswith("can_"):
            context.user_data['cancel_target_id'] = data.replace("can_", "")
            btns = [
                [InlineKeyboardButton("Change of schedule", callback_data="creason_Change of schedule")],
                [InlineKeyboardButton("Feeling better", callback_data="creason_Feeling better")],
                [InlineKeyboardButton("Booked wrong service", callback_data="creason_Booked wrong service")],
                [InlineKeyboardButton("Personal reasons", callback_data="creason_Personal reasons")],
                [InlineKeyboardButton("Other (Type below)", callback_data="creason_Other")]
            ]
            await query.edit_message_text("Why are you cancelling this appointment?\nSelect a reason below or type your own reason in the chat.", reply_markup=InlineKeyboardMarkup(btns))
            return CANCEL_REASON
            
        if data.startswith("creason_"):
            reason = data.replace("creason_", "")
            if reason == "Other":
                await query.edit_message_text("Please type your cancellation reason:")
                return CANCEL_REASON
            return await execute_cancellation(query.message, context, reason)

    elif update.message and update.message.text:
        reason = clean_bot_username(update.message.text)
        return await execute_cancellation(update.message, context, reason)

async def execute_cancellation(message, context, reason):
    appt_id = context.user_data.get('cancel_target_id')
    if not appt_id: return ConversationHandler.END

    async with httpx.AsyncClient() as client:
        try:
            await client.post(f"{API_BASE}/cancel-appointment/{appt_id}", json={"cancel_reason": reason}, timeout=5.0)
            text = "✅ Appointment successfully cancelled."
            if hasattr(message, 'edit_text'): await message.edit_text(text)
            else: await message.reply_text(text)
        except Exception as e:
            logger.error(f"Cancel error: {e}")
            text = "⚠️ Failed to cancel appointment. Please try again."
            if hasattr(message, 'edit_text'): await message.edit_text(text)
            else: await message.reply_text(text)

    btns = [[InlineKeyboardButton("Yes", callback_data="help_yes"), InlineKeyboardButton("No, I'm done", callback_data="help_no")]]
    await message.reply_text("Is there anything else I can help you with?", reply_markup=InlineKeyboardMarkup(btns))
    return FINAL_HELP

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    logger.info(f"User {update.effective_user.id} triggered /start command.")
    context.user_data['is_editing'] = False 
    clinic_name = "our Clinic"
    
    if CLINIC_ID:
        async with httpx.AsyncClient() as client:
            try:
                res = await client.get(f"{API_BASE}/clinic/{CLINIC_ID}", timeout=3.0)
                if res.status_code == 200: clinic_name = res.json().get('name', 'our Clinic')
            except Exception as e: 
                logger.error(f"Could not fetch clinic name, using default. Error: {e}")
            
    context.user_data['clinic_name'] = clinic_name
    
    if update.message: await update.message.reply_text(f"Welcome to {clinic_name}!")
    else: await update.callback_query.message.reply_text(f"Welcome to {clinic_name}!")

    btns = [[InlineKeyboardButton("Malaysian", callback_data="nat_my")],
            [InlineKeyboardButton("Non-Malaysian", callback_data="nat_non")]]
    msg = "To get started, please select your nationality:"
    
    if update.message: await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    else: await update.callback_query.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    return NAT_CHOICE

async def nat_choice_logic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    is_my = (query.data == "nat_my")
    context.user_data['is_malaysian'] = is_my
    
    nat_str = "Malaysian" if is_my else "Non-Malaysian"
    await query.edit_message_text(f"You selected: {nat_str}")
    
    if is_my:
        btns = [[InlineKeyboardButton("Upload MyKad", callback_data="meth_photo")],
                [InlineKeyboardButton("Enter Manually", callback_data="meth_manual")]]
        await query.message.reply_text("Would you like to auto-fill your details by uploading your MyKad, or enter them manually?", reply_markup=InlineKeyboardMarkup(btns))
        return MY_METHOD_CHOICE
    else:
        await query.message.reply_text("Please enter your Passport Number:")
        return MAN_ID_CHECK

async def my_method_logic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data == "meth_photo":
        await query.edit_message_text("You selected: Upload MyKad")
        await query.message.reply_text("Please upload a clear photo of your MyKad:")
        return UPLOAD_IC
    else:
        await query.edit_message_text("You selected: Enter Manually")
        await query.message.reply_text("Please enter your IC Number (Format: XXXXXXXXXXXX or XXXXXX-XX-XXXX):")
        return MAN_ID_CHECK

async def handle_existing_patient_basic_confirm(update: Update, context: ContextTypes.DEFAULT_TYPE, patient):
    context.user_data['name'] = patient['name'].upper()
    context.user_data['phone'] = patient['phone']
    context.user_data['address'] = patient.get('address', 'UNKNOWN').upper()
    context.user_data['gender'] = patient.get('gender', 'UNKNOWN').upper()
    context.user_data['nationality'] = patient.get('nationality', 'UNKNOWN').upper()
    context.user_data['ic'] = patient['ic_passport_number']
    
    msg = (f"Welcome {patient['name'].upper()}\n\n"
           f"📋 Please confirm your details:\n"
           f"Name: {patient['name'].upper()}\n"
           f"IC Number: {patient['ic_passport_number']}\n"
           f"Phone: {patient['phone']}\n")
           
    btns = [[InlineKeyboardButton("✅ Yes, it's me", callback_data="basic_yes")],
            [InlineKeyboardButton("❌ No, it's not me", callback_data="basic_no")]]
            
    if update.callback_query:
        await update.callback_query.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    else:
        await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    return BASIC_CONFIRM

async def basic_confirm_logic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if query.data == "basic_no":
        await query.edit_message_text("Please re-enter your IC/Passport number.")
        return MAN_ID_CHECK

    elif query.data == "basic_yes":
        msg = (f"Please confirm your details:\n"
               f"Name: {context.user_data['name']}\n"
               f"IC Number: {context.user_data['ic']}\n"
               f"Gender: {context.user_data['gender']}\n"
               f"Nationality: {context.user_data['nationality']}\n"
               f"Address: {context.user_data['address']}\n"
               f"Phone: {context.user_data['phone']}\n\n"
               f"Is there any information you want to update?")

        btns = [[InlineKeyboardButton("✏️ Yes, I want to edit", callback_data="prof_edit")],
                [InlineKeyboardButton("✅ No, all information are correct", callback_data="prof_yes")]]

        await query.edit_message_text(msg, reply_markup=InlineKeyboardMarkup(btns))
        return CONFIRM_PROFILE

async def handle_ic_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    photo_file = await update.message.photo[-1].get_file()
    fd, path = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)
    await photo_file.download_to_drive(path)
    
    processing_msg = await update.message.reply_text("🔍 Analyzing MyKad, please wait...")
    try: name, ic, address, gender, nationality = await asyncio.to_thread(extract_ic_info, path)
    except Exception as e: 
        logger.error(f"OCR Error: {e}")
        name, ic, address, gender, nationality = None, None, None, None, None
    finally:
        if os.path.exists(path): os.remove(path)
            
    await processing_msg.delete()
        
    if not ic:
        btns = [[InlineKeyboardButton("Try Again (Upload MyKad)", callback_data="meth_photo")],
                [InlineKeyboardButton("Enter Manually", callback_data="meth_manual")]]
        msg = "❌ Error: Could not detect MyKad information clearly. The photo might be blurry or poorly lit.\n\nWould you like to try uploading again or enter your details manually?"
        await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
        return MY_METHOD_CHOICE
        
    context.user_data['ic'] = ic
    
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(f"{API_BASE}/patient/{CLINIC_ID}/id/{ic}", timeout=5.0)
            if res.status_code == 200:
                patient = res.json()
                return await handle_existing_patient_basic_confirm(update, context, patient)
        except Exception as e:
            pass 

    context.user_data['name'] = name.upper()
    context.user_data['address'] = address.upper()
    context.user_data['gender'] = gender.upper()
    context.user_data['nationality'] = nationality.upper()

    await update.message.reply_text(f"✅ MyKad Scanned successfully!\nPlease enter your phone number:")
    return MAN_PHONE

async def man_id_check(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = clean_bot_username(update.message.text)
    is_my = context.user_data.get('is_malaysian')

    if is_my:
        ic_digits = re.sub(r'\D', '', text)
        if len(ic_digits) != 12:
            await update.message.reply_text("❌ Wrong format! Please enter your IC Number again (must be exactly 12 digits or formatted as XXXXXX-XX-XXXX):")
            return MAN_ID_CHECK
        formatted_id = f"{ic_digits[:6]}-{ic_digits[6:8]}-{ic_digits[8:]}"
        context.user_data['ic'] = formatted_id
        context.user_data['gender'] = "FEMALE" if int(ic_digits[-1]) % 2 == 0 else "MALE"
        context.user_data['nationality'] = "MALAYSIA"
    else:
        context.user_data['ic'] = text
        
    if context.user_data.get('edit_mode'): return await show_profile_summary(update, context)

    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(f"{API_BASE}/patient/{CLINIC_ID}/id/{context.user_data['ic']}", timeout=5.0)
            if res.status_code == 200:
                patient = res.json()
                return await handle_existing_patient_basic_confirm(update, context, patient)
        except Exception as e:
            pass

    await update.message.reply_text("Please enter your Full Name:")
    return MAN_NAME

async def man_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['name'] = clean_bot_username(update.message.text).upper()
    if context.user_data.get('edit_mode'): return await show_profile_summary(update, context)
    
    if context.user_data.get('is_malaysian'):
        await update.message.reply_text(f"Please enter your phone number:")
        return MAN_PHONE
    else:
        await update.message.reply_text("Please enter your Gender (Male / Female):")
        return MAN_GENDER

async def man_gender(update: Update, context: ContextTypes.DEFAULT_TYPE):
    raw_gender = clean_bot_username(update.message.text).upper()
    
    if "FEMA" in raw_gender:
        context.user_data['gender'] = "FEMALE"
    elif "MALE" in raw_gender:
        context.user_data['gender'] = "MALE"
    else:
        matches = difflib.get_close_matches(raw_gender, ["MALE", "FEMALE"], n=1, cutoff=0.4)
        if matches:
            context.user_data['gender'] = matches[0]
        else:
            await update.message.reply_text("❌ Invalid gender. Please enter 'Male' or 'Female':")
            return MAN_GENDER
        
    if context.user_data.get('edit_mode'): return await show_profile_summary(update, context)
    
    await update.message.reply_text("Please enter your Country of Nationality:")
    return MAN_NAT

async def man_nat(update: Update, context: ContextTypes.DEFAULT_TYPE):
    raw_nat = clean_bot_username(update.message.text).upper()
    
    if raw_nat in COUNTRIES_LIST:
        context.user_data['nationality'] = raw_nat
        if context.user_data.get('edit_mode'): return await show_profile_summary(update, context)
        
        await update.message.reply_text(f"Nationality saved as {raw_nat}.\n\nPlease enter your phone number (including country code, e.g. +1...):", parse_mode="Markdown")
        return MAN_PHONE
        
    matches = difflib.get_close_matches(raw_nat, COUNTRIES_LIST, n=1, cutoff=0.4)
    if matches:
        context.user_data['temp_nat'] = matches[0]
        btns = [[InlineKeyboardButton("Yes", callback_data="nat_conf_yes"), InlineKeyboardButton("No", callback_data="nat_conf_no")]]
        await update.message.reply_text(f"Did you mean {matches[0]}?", reply_markup=InlineKeyboardMarkup(btns))
        return MAN_NAT_CONFIRM
    else:
        await update.message.reply_text("❌ Country not recognized. Please enter a valid country name:")
        return MAN_NAT

async def man_nat_confirm(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data == "nat_conf_yes":
        nat = context.user_data.get('temp_nat')
        context.user_data['nationality'] = nat
        if context.user_data.get('edit_mode'): 
            return await show_profile_summary(update, context)
            
        await query.edit_message_text(f"Nationality saved as {nat}.\n\nPlease enter your phone number (including country code, e.g. +1...):", parse_mode="Markdown")
        return MAN_PHONE
    else:
        await query.edit_message_text("Please enter your Country of Nationality again:")
        return MAN_NAT

async def man_phone(update: Update, context: ContextTypes.DEFAULT_TYPE):
    phone_input = clean_bot_username(update.message.text)
    
    if context.user_data.get('is_malaysian'):
        pattern = r'^0\d{1,2}-?\d{7,8}$'
        if not re.match(pattern, phone_input):
            await update.message.reply_text("Invalid phone number format. Please re-enter.")
            return MAN_PHONE
        clean_num = phone_input.replace('-', '')
        if clean_num.startswith('011') or clean_num.startswith('015'):
            formatted = f"+60{clean_num[1:3]}-{clean_num[3:]}"
        else:
            formatted = f"+60{clean_num[1:2]}-{clean_num[2:]}"
        context.user_data['phone'] = formatted
    else:
        context.user_data['phone'] = phone_input

    if context.user_data.get('edit_mode'): return await show_profile_summary(update, context)
    
    await update.message.reply_text("Please enter your Home Address:")
    return MAN_ADDRESS

async def man_address(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['address'] = clean_bot_username(update.message.text).upper()
    return await show_profile_summary(update, context)

async def show_profile_summary(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['edit_mode'] = False
    msg = (f"Please confirm your details:\n"
           f"Name: {context.user_data.get('name')}\n"
           f"IC Number: {context.user_data.get('ic')}\n"
           f"Gender: {context.user_data.get('gender')}\n"
           f"Nationality: {context.user_data.get('nationality')}\n"
           f"Address: {context.user_data.get('address')}\n"
           f"Phone: {context.user_data.get('phone')}\n\n"
           f"Are you sure this details are correct?")
           
    btns = [[InlineKeyboardButton("Yes", callback_data="prof_yes")],
            [InlineKeyboardButton("No, edit details", callback_data="prof_edit")]]
    
    if update.callback_query:
        await update.callback_query.edit_message_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    else: 
        await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    return CONFIRM_PROFILE

async def confirm_profile_logic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data == "prof_edit":
        btns = [
            [InlineKeyboardButton("Name", callback_data="edit_name"), InlineKeyboardButton("IC Number", callback_data="edit_ic")],
            [InlineKeyboardButton("Gender", callback_data="edit_gender"), InlineKeyboardButton("Nationality", callback_data="edit_nat")],
            [InlineKeyboardButton("Address", callback_data="edit_address"), InlineKeyboardButton("Phone", callback_data="edit_phone")],
            [InlineKeyboardButton("❌ Cancel Editing", callback_data="edit_cancel")]
        ]
        await query.edit_message_text("Which detail would you like to modify?", reply_markup=InlineKeyboardMarkup(btns))
        return EDIT_PROFILE_MENU

    await query.edit_message_text("✅ Profile confirmed. Saving to database...")
    
    async with httpx.AsyncClient() as client:
        try:
            await client.post(f"{API_BASE}/register-patient", json={
                "clinic_id": CLINIC_ID, "name": context.user_data['name'].upper(), "ic_passport_number": context.user_data['ic'].upper(), 
                "phone": context.user_data['phone'], "telegram_id": update.effective_user.id,
                "address": context.user_data.get('address', '').upper(), "gender": context.user_data.get('gender', '').upper(), "nationality": context.user_data.get('nationality', '').upper() 
            }, timeout=5.0)
        except Exception as e:
            logger.error(f"Error registering patient: {e}")
        
    return await show_main_services(query.message, context)

async def handle_profile_edit_selection(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    field = query.data.replace("edit_", "")
    
    if field == "cancel":
        return await show_profile_summary(update, context)
        
    context.user_data['edit_mode'] = True
    
    prompts = {
        "name": "Full Name",
        "ic": "IC/Passport Number",
        "gender": "Gender (Male/Female)",
        "nat": "Nationality",
        "address": "Home Address",
        "phone": "Phone Number"
    }
    
    state_keys = {
        "name": "name", "ic": "ic", "gender": "gender", "nat": "nationality", "address": "address", "phone": "phone"
    }
    
    current_val = str(context.user_data.get(state_keys[field], ''))
    if field == "phone" and context.user_data.get('is_malaysian'):
        current_val = current_val.replace("+60", "0")
        
    btns = [
        [InlineKeyboardButton("✏️ Tap here to Edit", switch_inline_query_current_chat=current_val)],
        [InlineKeyboardButton("🔙 Back to Edit Menu", callback_data="prof_edit")]
    ]
    msg = f"Click the button below to edit your *{prompts[field]}*, then press send! (You do not need to delete my bot name)."
    
    await query.edit_message_text(msg, reply_markup=InlineKeyboardMarkup(btns), parse_mode="Markdown")
    
    if field == "name": return MAN_NAME
    if field == "ic": return MAN_ID_CHECK
    if field == "gender": return MAN_GENDER
    if field == "nat": return MAN_NAT
    if field == "address": return MAN_ADDRESS
    if field == "phone": return MAN_PHONE

async def show_main_services(message, context):
    btns = [[InlineKeyboardButton("Vaccines", callback_data="svc_Vaccine")],
            [InlineKeyboardButton("Blood Tests", callback_data="svc_Blood Test")],
            [InlineKeyboardButton("Others", callback_data="svc_Others")]]
    msg = "What service do you need today?"
    if hasattr(message, 'edit_text'): await message.edit_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    else: await message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    return SERVICE

async def service_choice(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data.startswith("svc_"):
        service = query.data.replace("svc_", "")
        context.user_data['service'] = service
        context.user_data['selected_items'] = []
    else:
        service = context.user_data.get('service')
    
    if service == 'Others':
        await query.edit_message_text("You selected: Others")
        return await show_doctor_preference(update, context)

    async with httpx.AsyncClient() as client:
        try:
            if service == 'Vaccine':
                res = await client.get(f"{API_BASE}/vaccines/{CLINIC_ID}", timeout=5.0)
                vaccines = res.json()
                
                user_gender = context.user_data.get('gender', 'ANY').upper()
                filtered_vacs = [v for v in vaccines if not v.get('target_gender') or v.get('target_gender').upper() in ['ANY', user_gender]]
                context.user_data['vaccines_list'] = filtered_vacs
                
                types = list(set(v.get('type', 'General').strip() for v in filtered_vacs))
                btns = [[InlineKeyboardButton(t.title(), callback_data=f"vtype_{t}")] for t in types]
                btns.append([InlineKeyboardButton("🔙 Back to Services", callback_data="back_start")])
                
                await query.edit_message_text("Please choose a vaccine category/type:", reply_markup=InlineKeyboardMarkup(btns))
                return V_TYPE
                
            elif service == 'Blood Test':
                return await show_blood_tests(update, context, "package")
        except Exception as e:
            logger.error(f"Error fetching service details: {e}")
            await query.message.reply_text("Server is currently unreachable. Please try again later.")
            return SERVICE

async def vaccine_type_selected(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    v_type = query.data.replace("vtype_", "")
    
    vaccines = context.user_data.get('vaccines_list', [])
    type_vacs = [v for v in vaccines if v.get('type', 'General').strip() == v_type]
    
    btns = [[InlineKeyboardButton(f"{v['name']} (RM{float(v['price']):.2f})", callback_data=f"v_{v['name']}")] for v in type_vacs]
    btns.append([InlineKeyboardButton("🔙 Back to Vaccine Categories", callback_data="back_v_type")])
    await query.edit_message_text(f"Category: {v_type.title()}\nPlease choose a specific vaccine:", reply_markup=InlineKeyboardMarkup(btns))
    return V_SELECT

async def restart_service(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    if query: await query.answer()
    return await show_main_services(query.message, context)

async def render_v_dose_menu(update: Update, context: ContextTypes.DEFAULT_TYPE, vaccine_name: str):
    vaccines = context.user_data.get('vaccines_list', [])
    selected_vac = next((v for v in vaccines if v['name'] == vaccine_name), None)
    total_doses = selected_vac.get('total_doses', 1) if selected_vac else 1
    has_booster = selected_vac.get('has_booster', False) if selected_vac else False
    
    btns = []
    if total_doses <= 1: btns.append([InlineKeyboardButton("Single Dose", callback_data="dose_Single Dose")])
    else:
        dose_row = []
        for i in range(1, total_doses + 1):
            dose_row.append(InlineKeyboardButton(f"Dose {i}", callback_data=f"dose_Dose {i}"))
            if len(dose_row) == 2: 
                btns.append(dose_row)
                dose_row = []
        if dose_row: btns.append(dose_row)
            
    if has_booster: btns.append([InlineKeyboardButton("Booster", callback_data="dose_Booster")])
    
    if context.user_data.get('is_editing'):
        btns.append([InlineKeyboardButton("🔙 Back to Edit Menu", callback_data="back_edit_menu")])
    else:
        btns.append([InlineKeyboardButton("🔙 Back to Vaccine Categories", callback_data="back_v_type")])
    
    msg = "Which dose are you taking?"
    if update.callback_query: await update.callback_query.edit_message_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    else: await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    return V_DOSE

async def route_back_v_type(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    context.user_data['service'] = 'Vaccine'
    
    vaccines = context.user_data.get('vaccines_list', [])
    types = list(set(v.get('type', 'General').strip() for v in vaccines))
    btns = [[InlineKeyboardButton(t.title(), callback_data=f"vtype_{t}")] for t in types]
    btns.append([InlineKeyboardButton("🔙 Back to Services", callback_data="back_start")])
    
    await query.edit_message_text("Please choose a vaccine category/type:", reply_markup=InlineKeyboardMarkup(btns))
    return V_TYPE

async def vaccine_selected(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    vaccine_name = query.data.replace("v_", "")
    
    vac = next((v for v in context.user_data.get('vaccines_list', []) if v['name'] == vaccine_name), None)
    user_gender = context.user_data.get('gender', 'ANY').upper()
    if vac and vac.get('target_gender') and vac.get('target_gender').upper() not in ['ANY', user_gender]:
        await query.answer(f"⚠️ Alert: This vaccine is exclusively designed for {vac.get('target_gender').upper()} patients.", show_alert=True)
        return V_SELECT
    
    await query.answer()
    context.user_data['selected_items'] = [vaccine_name]
    return await render_v_dose_menu(update, context, vaccine_name)

async def vaccine_dose(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    context.user_data['dose'] = query.data.replace("dose_", "")
    
    if context.user_data.get('is_editing'):
        return await show_booking_summary(update, context)
    return await show_doctor_preference(update, context)

async def show_blood_tests(update: Update, context: ContextTypes.DEFAULT_TYPE, t_type):
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(f"{API_BASE}/blood-tests/{CLINIC_ID}/{t_type}", timeout=5.0)
            tests = res.json()
        except Exception as e:
            logger.error(f"Error fetching blood tests: {e}")
            tests = []
            
        user_gender = context.user_data.get('gender', 'ANY').upper()
        tests = [t for t in tests if not t.get('target_gender') or t.get('target_gender').upper() in ['ANY', user_gender]]
        context.user_data[f'bt_cache_{t_type}'] = tests
        
        selected_names = context.user_data.get('selected_items', [])
        excluded_singles = set(selected_names)

        if t_type == 'single':
            pkg_cache = context.user_data.get('bt_cache_package', [])
            for pkg in pkg_cache:
                if pkg['name'] in selected_names:
                    included = pkg.get('included_tests', [])
                    if isinstance(included, list):
                        excluded_singles.update(included)
        
        btns = []
        msg_details = ""
        
        for t in tests:
            if t['name'] not in excluded_singles:
                btns.append([InlineKeyboardButton(f"{t['name']} (RM{float(t['price']):.2f})", callback_data=f"selbt_{t['id']}")])
                if t_type == "package" and t.get('included_tests'):
                    included_str = ", ".join(t['included_tests'])
                    msg_details += f"📦 *{t['name']}*\nIncludes: {included_str}\n\n"
        
        if t_type == 'single' and len(btns) == 0:
            return await show_doctor_preference(update, context)
        
        if t_type == "package": 
            btns.append([InlineKeyboardButton("OR Browse Single Tests", callback_data="bt_others")])
            if context.user_data.get('is_editing'): btns.append([InlineKeyboardButton("🔙 Back to Edit Menu", callback_data="back_edit_menu")])
            else: btns.append([InlineKeyboardButton("🔙 Back to Services", callback_data="back_start")])
            
            msg = f"🩸 *Choose a Blood Test Package:*\n\n{msg_details}Select a package below:"
        else:
            btns.append([InlineKeyboardButton("🔙 Back to Packages", callback_data="back_bt_pkg")])
            msg = "🩸 *Choose an add-on Single Test:*"
            
        markup = InlineKeyboardMarkup(btns)
        
        if update.callback_query:
            await update.callback_query.edit_message_text(msg, reply_markup=markup, parse_mode="Markdown")
        else: 
            await update.message.reply_text(msg, reply_markup=markup, parse_mode="Markdown")
        return BT_FLOW

async def bt_logic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    data = query.data
    
    if data == "back_start": 
        await query.answer()
        return await restart_service(update, context)
    
    if data == "back_bt_pkg": 
        await query.answer()
        context.user_data['selected_items'] = []
        return await show_blood_tests(update, context, "package")
    
    if data == "bt_others": 
        await query.answer()
        return await show_blood_tests(update, context, "single")
        
    if data.startswith("selbt_"):
        bt_id = int(data.replace("selbt_", ""))
        bt_name = "Unknown Test"
        bt_target_gender = "ANY"
        for t_type in ['package', 'single']:
            cache = context.user_data.get(f'bt_cache_{t_type}', [])
            for t in cache:
                if t['id'] == bt_id:
                    bt_name = t['name']
                    bt_target_gender = t.get('target_gender', 'ANY')
                    break
                    
        user_gender = context.user_data.get('gender', 'ANY').upper()
        if bt_target_gender and bt_target_gender.upper() not in ['ANY', user_gender]:
            await query.answer(f"⚠️ Alert: This service is explicitly designed for {bt_target_gender.upper()} patients.", show_alert=True)
            return BT_FLOW
            
        await query.answer()
        cache_pkg = context.user_data.get('bt_cache_package', [])
        is_pkg = any(p['name'] == bt_name for p in cache_pkg)
        if is_pkg:
            context.user_data['selected_items'] = [bt_name]
        else:
            context.user_data['selected_items'].append(bt_name)
        
        pkg = next((p for p in cache_pkg if p['name'] == bt_name), None)
        if pkg:
            included = pkg.get('included_tests', [])
            async with httpx.AsyncClient() as client:
                try:
                    sgl_res = await client.get(f"{API_BASE}/blood-tests/{CLINIC_ID}/single")
                    all_singles = sgl_res.json()
                    available_singles = [s for s in all_singles if s['name'] not in included and (not s.get('target_gender') or s.get('target_gender').upper() in ['ANY', user_gender])]
                    
                    if len(available_singles) == 0:
                        await query.edit_message_text(f"Added: {bt_name}. \n(Note: All available single tests are already included in this package).")
                        if context.user_data.get('is_editing'):
                            return await show_booking_summary(update, context)
                        return await show_doctor_preference(update, context)
                except Exception as e:
                    logger.error(f"Error checking single tests: {e}")

        btns = [[InlineKeyboardButton("Yes, add more", callback_data="add_more"), InlineKeyboardButton("No thanks, finish", callback_data="add_done")]]
        await query.edit_message_text(f"Added: {bt_name}.\nWould you like to add any single tests?", reply_markup=InlineKeyboardMarkup(btns))
        return BT_FLOW
        
    if data == "add_more": 
        await query.answer()
        return await show_blood_tests(update, context, "single")
        
    if data == "add_done":
        await query.answer()
        if context.user_data.get('is_editing'):
            return await show_booking_summary(update, context)
        return await show_doctor_preference(update, context)

async def show_doctor_preference(update: Update, context: ContextTypes.DEFAULT_TYPE):
    btns = [
        [InlineKeyboardButton("Any Doctor", callback_data="doc_ANY")],
        [InlineKeyboardButton("Female Doctor", callback_data="doc_FEMALE"), InlineKeyboardButton("Male Doctor", callback_data="doc_MALE")],
        [InlineKeyboardButton("Specific Doctor", callback_data="doc_SPECIFIC")]
    ]
    
    is_editing = context.user_data.get('is_editing')
    
    if is_editing:
        btns.append([InlineKeyboardButton("🔙 Back to Edit Menu", callback_data="back_edit_menu")])
    else:
        service = context.user_data.get('service')
        if service == 'Vaccine': btns.append([InlineKeyboardButton("🔙 Back to Vaccines", callback_data="back_v_type")])
        elif service == 'Blood Test': btns.append([InlineKeyboardButton("🔙 Back to Packages", callback_data="back_bt_pkg")])
        elif service == 'Others': btns.append([InlineKeyboardButton("🔙 Back to Services", callback_data="back_start")])

    msg = "Do you have a doctor preference?"
    if update.callback_query: 
        await update.callback_query.edit_message_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    else: 
        await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    return DOC_PREF

async def handle_doc_pref(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    pref = query.data.replace("doc_", "")
    
    if pref == "SPECIFIC":
        await query.edit_message_text("You selected: Specific Doctor")
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{API_BASE}/doctors/{CLINIC_ID}")
            doctors = res.json()
        btns = [[InlineKeyboardButton(d['name'], callback_data=f"docname_{d['name']}")] for d in doctors]
        btns.append([InlineKeyboardButton("🔙 Back to Preferences", callback_data="back_doc_pref")])
        await query.message.reply_text("Please choose a doctor:", reply_markup=InlineKeyboardMarkup(btns))
        return DOC_SELECT
    else:
        context.user_data['doctor_pref'] = pref
        if pref == "ANY":
            await query.edit_message_text("You selected: Any Doctor")
        else:
            await query.edit_message_text(f"You selected: {pref.title()} Doctor")
            
        if context.user_data.get('is_editing'):
            old_pref = context.user_data.get('old_doctor_pref')
            if pref != old_pref:
                await query.message.reply_text("⚠️ You changed your doctor preference. Because doctors have different schedules, please re-select your Date and Time.")
                await trigger_datetime_prompt(update, context)
                return BOOK_DATE_TIME
            else:
                await query.message.reply_text("✅ Doctor preference unchanged.")
                return await show_booking_summary(update, context)
                
        await trigger_datetime_prompt(update, context)
        return BOOK_DATE_TIME

async def handle_doc_select(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    name = query.data.replace("docname_", "")
    context.user_data['doctor_pref'] = name
    await query.edit_message_text(f"You selected: {name}")
    
    if context.user_data.get('is_editing'):
        old_pref = context.user_data.get('old_doctor_pref')
        if name != old_pref:
            await query.message.reply_text("⚠️ You changed your doctor preference. Because doctors have different schedules, please re-select your Date and Time.")
            await trigger_datetime_prompt(update, context)
            return BOOK_DATE_TIME
        else:
            await query.message.reply_text("✅ Doctor preference unchanged.")
            return await show_booking_summary(update, context)
        
    await trigger_datetime_prompt(update, context)
    return BOOK_DATE_TIME

async def trigger_datetime_prompt(update: Update, context: ContextTypes.DEFAULT_TYPE):
    service = context.user_data['service']
    doctor_pref = context.user_data.get('doctor_pref', 'ANY')
    is_editing = context.user_data.get('is_editing', False)
    
    markup = await generate_date_picker(service, doctor_pref, is_editing)
    
    if service in ['Vaccine', 'Blood Test']:
        msg = "Please select a Date below, \nOR type your request (e.g., 'Tomorrow at 10am'):"
    else:
        msg = "Please select a Date below, \nOR type your request naturally (e.g., 'Tomorrow at 10am for fever'):"
        
    if update.callback_query: await update.callback_query.message.reply_text(msg, reply_markup=markup)
    elif update.message: await update.message.reply_text(msg, reply_markup=markup)

async def handle_date_time_selection(update: Update, context: ContextTypes.DEFAULT_TYPE):
    service = context.user_data['service']
    doctor_pref = context.user_data.get('doctor_pref', 'ANY')

    if update.callback_query:
        query = update.callback_query
        await query.answer()
        data = query.data

        if data.startswith("date_"):
            context.user_data['book_date'] = data.replace("date_", "")
            markup = await generate_time_picker(service, context.user_data['book_date'], doctor_pref)
            await query.edit_message_text(f"You selected: {context.user_data['book_date']}\n\nNow, please select your preferred Time:", reply_markup=markup)
            return BOOK_DATE_TIME

        elif data == "back_date":
            is_editing = context.user_data.get('is_editing', False)
            markup = await generate_date_picker(service, doctor_pref, is_editing)
            if service in ['Vaccine', 'Blood Test']: msg = "Please select a Date below, \nOR type your request (e.g., 'Tomorrow at 10am'):"
            else: msg = "Please select a Date below, \nOR type your request naturally (e.g., 'Tomorrow at 10am for fever'):"
            await query.edit_message_text(msg, reply_markup=markup)
            return BOOK_DATE_TIME

        elif data.startswith("time_"):
            time_str = data.replace("time_", "")
            await query.edit_message_text(f"You selected: {time_str}")
            full_time_str = f"{context.user_data['book_date']} {time_str}"
            return await process_availability(update, context, full_time_str)

        elif data.startswith("sug_"):
            full_time_str = data.replace("sug_", "")
            await query.edit_message_text(f"You selected: {full_time_str}")
            context.user_data['book_date'] = full_time_str.split(" ")[0]
            return await process_availability(update, context, full_time_str)

    elif update.message and update.message.text:
        text = clean_bot_username(update.message.text)
        if not text: return BOOK_DATE_TIME 
        
        processing_msg = await update.message.reply_text("🤖 AI is reading your request...")
        
        async with httpx.AsyncClient() as client:
            try:
                res = await client.post(f"{API_BASE}/ai-extract", json={"text": text}, timeout=120.0)
                ext = res.json() if res.status_code == 200 else {"error": "Backend offline."}
            except Exception as e:
                logger.error(f"AI Extract Error: {e}")
                ext = {"error": "Connection to AI failed."}
            
        await processing_msg.delete()
        
        if "error" in ext:
            is_editing = context.user_data.get('is_editing', False)
            markup = await generate_date_picker(service, doctor_pref, is_editing)
            msg = f"⚠️ AI Process Error: {ext['error']}\n\nPlease select a Date below."
            await update.message.reply_text(msg, reply_markup=markup)
            return BOOK_DATE_TIME

        intent = ext.get('intent', 'booking')
        if intent == 'question':
            async with httpx.AsyncClient() as client:
                await client.post(f"{API_BASE}/ask-admin", json={"clinic_id": CLINIC_ID, "telegram_id": update.effective_user.id, "message": text})
            await update.message.reply_text("This message will be handled by the clinic admin, who will reply as soon as possible.")
            return BOOK_DATE_TIME

        if intent == 'reschedule':
            await update.message.reply_text("I see you want to reschedule. Let's make a new booking, then you can type /cancel to cancel your old one.")
        
        date_pref = ext.get('date_preference')
        time_pref = ext.get('time_preference')
        
        if ext.get('doctor_preference'): context.user_data['doctor_pref'] = ext.get('doctor_preference')
        if ext.get('general_notes'): context.user_data['general_notes'] = ext.get('general_notes')
        
        if date_pref and time_pref:
            full_time_str = f"{date_pref} {time_pref}"
            context.user_data['book_date'] = date_pref
            return await process_availability(update, context, full_time_str)
        elif date_pref:
            context.user_data['book_date'] = date_pref
            markup = await generate_time_picker(service, date_pref, context.user_data.get('doctor_pref'))
            msg = f"I successfully understood your preferred date: {date_pref}.\nHowever, the time is missing.\nPlease select a valid time below or type it."
            await update.message.reply_text(msg, reply_markup=markup)
            return BOOK_DATE_TIME
        elif time_pref:
            markup = await generate_date_picker(service, context.user_data.get('doctor_pref'), context.user_data.get('is_editing', False))
            msg = f"I successfully understood your preferred time: {time_pref}.\nHowever, the date is missing.\nPlease select a valid date below or type it."
            await update.message.reply_text(msg, reply_markup=markup)
            return BOOK_DATE_TIME
        else:
            is_editing = context.user_data.get('is_editing', False)
            if is_editing and ext.get('general_notes') and context.user_data.get('book_time'):
                await update.message.reply_text(f"✅ Notes noted: {ext.get('general_notes')}")
                return await show_booking_summary(update, context)
            
            markup = await generate_date_picker(service, context.user_data.get('doctor_pref'), is_editing)
            msg = "I understood you want to book an appointment, but the date and time format was invalid or missing.\nPlease select a Date below or provide the exact date and time."
            await update.message.reply_text(msg, reply_markup=markup)
            return BOOK_DATE_TIME

async def process_availability(update, context, full_time_str):
    service = context.user_data['service']
    duration = 15 if service == 'Vaccine' else 30
    doctor_pref = context.user_data.get('doctor_pref', 'ANY')
    
    payload = {
        "clinic_id": CLINIC_ID,
        "requested_time": full_time_str,
        "duration": duration,
        "doctor_pref": doctor_pref
    }
    
    async with httpx.AsyncClient() as client:
        try:
            res = await client.post(f"{API_BASE}/check-availability", json=payload, timeout=10.0)
            data = res.json()
        except Exception as e:
            logger.error(f"Check Availability Error: {e}")
            data = {"is_valid": False, "reason": "Server error checking availability.", "suggestions": []}
    
    if not data.get('is_valid'):
        sugs = data.get('suggestions', [])
        btns = [[InlineKeyboardButton(s, callback_data=f"sug_{s}")] for s in sugs]
        
        if "Multiple doctors match" in data.get('reason', '') or "No doctor matching" in data.get('reason', ''):
             btns.append([InlineKeyboardButton("👩‍⚕️ Reselect Doctor Preference", callback_data="back_doc_pref")])
        else:
             btns.append([InlineKeyboardButton("📅 Choose Another Time", callback_data="back_date")])
        
        msg = f"❌ {data.get('reason', 'Slot unavailable')}"
        if sugs: msg += "\nHere are alternative slots:"
        
        if update.callback_query: await update.callback_query.edit_message_text(msg, reply_markup=InlineKeyboardMarkup(btns))
        else: await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
        return BOOK_DATE_TIME

    context.user_data['book_time'] = full_time_str
    
    if 'doctor_name' in data:
        context.user_data['assigned_doctor_name'] = data['doctor_name']
        context.user_data['assigned_doctor_id'] = data['doctor_id']

    return await show_booking_summary(update, context)

async def show_booking_summary(update: Update, context: ContextTypes.DEFAULT_TYPE):
    service = context.user_data['service']
    name = context.user_data['name']
    ic = context.user_data['ic']
    phone = context.user_data['phone']
    
    if service == 'Vaccine': details = f"{context.user_data['selected_items'][0]} ({context.user_data.get('dose')})"
    elif service == 'Blood Test': details = ", ".join(context.user_data['selected_items'])
    else: details = f"{context.user_data.get('general_notes', 'General Consultation')}"
        
    doc_text = f"\nDoctor: {context.user_data.get('assigned_doctor_name', context.user_data.get('doctor_pref', 'ANY'))}"
    full_time_str = context.user_data['book_time']

    summary = (f"📋 *Booking Summary*\nName: {name}\nIC Number: {ic}\nPhone: {phone}\n"
               f"Date: {context.user_data['book_date']}\nTime: {full_time_str.split(' ')[1]}\n"
               f"Service: {service}\nDetails: {details}{doc_text}\n\nAre you sure this details are correct?")
    
    btns = [[InlineKeyboardButton("Yes, Confirm", callback_data="conf_yes")],
            [InlineKeyboardButton("No, Rebook / Edit", callback_data="conf_edit")]]
    
    if update.callback_query:
        await update.callback_query.edit_message_text(summary, reply_markup=InlineKeyboardMarkup(btns), parse_mode="Markdown")
    else:
        await update.message.reply_text(summary, reply_markup=InlineKeyboardMarkup(btns), parse_mode="Markdown")
    return CONFIRM_BOOK

async def handle_edit_menu_routing(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    btns = [
        [InlineKeyboardButton("Change Service", callback_data="editbook_service")],
        [InlineKeyboardButton("Change Vaccine/Test Details", callback_data="editbook_details")],
        [InlineKeyboardButton("Change Doctor Preference", callback_data="editbook_doctor")],
        [InlineKeyboardButton("Change Date or Time", callback_data="editbook_time")],
        [InlineKeyboardButton("❌ Cancel Draft Booking", callback_data="editbook_cancel")]
    ]
    await query.edit_message_text("What would you like to modify?", reply_markup=InlineKeyboardMarkup(btns))
    return EDIT_BOOKING_MENU

async def confirm_booking_logic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data == "conf_edit":
        return await handle_edit_menu_routing(update, context)

    await query.edit_message_text("Processing your booking...")
    
    service = context.user_data['service']
    vaccines = context.user_data.get('vaccines_list', [])
    selected_vac_name = context.user_data.get('selected_items', [None])[0] if context.user_data.get('selected_items') else None
    selected_vac = next((v for v in vaccines if v['name'] == selected_vac_name), None)
    total_doses = selected_vac.get('total_doses', 1) if selected_vac else 1

    details_block = {
        "items": context.user_data.get('selected_items', []), 
        "dose": context.user_data.get('dose'),
        "total_doses": total_doses,
        "general_notes": context.user_data.get('general_notes'),
        "doctor_pref": context.user_data.get('doctor_pref', 'ANY'),
        "assigned_doctor_name": context.user_data.get('assigned_doctor_name'),
        "assigned_doctor_id": context.user_data.get('assigned_doctor_id')
    }

    async with httpx.AsyncClient() as client:
        try:
            await client.post(f"{API_BASE}/book-appointment", json={
                "clinic_id": CLINIC_ID, "telegram_id": update.effective_user.id, "ic_passport_number": context.user_data['ic'].upper(), 
                "service_type": context.user_data['service'], "details": details_block, "scheduled_time": context.user_data['book_time']
            }, timeout=10.0)
        except Exception as e:
            logger.error(f"Error booking appointment: {e}")
    
    time_str = context.user_data['book_time']
    date_part, time_part = time_str.split(" ")
    
    if service == 'Vaccine': details = f"{context.user_data['selected_items'][0]} ({context.user_data.get('dose')})"
    elif service == 'Blood Test': details = ", ".join(context.user_data['selected_items'])
    else: details = f"{context.user_data.get('general_notes', 'General Consultation')}"
        
    doc_text = f"\nDoctor: {context.user_data.get('assigned_doctor_name', 'Assigned dynamically')}"

    confirmed_summary = (f"✅ *Booking Successfully Confirmed!*\n\n📋 *Confirmed Booking Summary*\n"
                         f"Name: {context.user_data['name']}\nIC Number: {context.user_data['ic']}\n"
                         f"Phone: {context.user_data['phone']}\nDate: {date_part}\nTime: {time_part}\n"
                         f"Service: {service}\nDetails: {details}{doc_text}\n")
    
    await query.message.reply_text(confirmed_summary, parse_mode="Markdown")
    btns = [[InlineKeyboardButton("Yes", callback_data="help_yes"), InlineKeyboardButton("No, I'm done", callback_data="help_no")]]
    await query.message.reply_text("Is there anything else I can help you with?", reply_markup=InlineKeyboardMarkup(btns))
    return FINAL_HELP

async def route_back_service_details(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    service = context.user_data.get('service')
    if service == 'Vaccine':
        return await route_back_v_type(update, context) 
    elif service == 'Blood Test':
        context.user_data['selected_items'] = []
        return await show_blood_tests(update, context, "package")
    else:
        return await restart_service(update, context)

async def handle_booking_edit(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    choice = query.data.replace("editbook_", "")
    
    context.user_data['is_editing'] = True
    
    if choice == "cancel":
        await query.edit_message_text("Draft Booking abandoned.")
        btns = [[InlineKeyboardButton("Yes", callback_data="help_yes"), InlineKeyboardButton("No, I'm done", callback_data="help_no")]]
        await query.message.reply_text("Is there anything else I can help you with?", reply_markup=InlineKeyboardMarkup(btns))
        return FINAL_HELP
        
    if choice == "service":
        return await show_main_services(query.message, context)
    elif choice == "details":
        service = context.user_data['service']
        if service == 'Vaccine':
            return await route_back_v_type(update, context)
        elif service == 'Blood Test':
            context.user_data['selected_items'] = []
            return await show_blood_tests(update, context, "package")
        else:
            await query.edit_message_text("Please type your reason for the visit (e.g., 'Fever and cough'):")
            return DOC_PREF 
    elif choice == "doctor":
        context.user_data['old_doctor_pref'] = context.user_data.get('doctor_pref', 'ANY')
        return await show_doctor_preference(update, context)
    elif choice == "time":
        await trigger_datetime_prompt(update, context)
        return BOOK_DATE_TIME

async def final_help_logic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == "help_yes":
        return await start(update, context) 
    else:
        await query.edit_message_text("No, I'm done")
        clinic_name = context.user_data.get('clinic_name', 'our Clinic')
        await query.message.reply_text(f"Thank you for using {clinic_name}. Have a great day!")
        return ConversationHandler.END

async def inline_query_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    pass

if __name__ == '__main__':
    app = (
        ApplicationBuilder()
        .token(TOKEN)
        .connect_timeout(30.0)
        .read_timeout(30.0)
        .write_timeout(30.0)
        .pool_timeout(30.0)
        .build()
    )
    
    async def error_handler(update, context):
        logger.error(f"Exception while handling an update: {context.error}")
    app.add_error_handler(error_handler)
    
    conv = ConversationHandler(
        entry_points=[CommandHandler('start', start), CommandHandler('cancel', cancel_command)],
        states={
            NAT_CHOICE: [CallbackQueryHandler(nat_choice_logic, pattern="^nat_")],
            MY_METHOD_CHOICE: [CallbackQueryHandler(my_method_logic, pattern="^meth_")],
            UPLOAD_IC: [MessageHandler(filters.PHOTO, handle_ic_photo)],
            MAN_ID_CHECK: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, man_id_check),
                CallbackQueryHandler(confirm_profile_logic, pattern="^prof_edit$")
            ],
            BASIC_CONFIRM: [
                CallbackQueryHandler(basic_confirm_logic, pattern="^basic_")
            ],
            MAN_NAME: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, man_name),
                CallbackQueryHandler(confirm_profile_logic, pattern="^prof_edit$")
            ],
            MAN_GENDER: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, man_gender),
                CallbackQueryHandler(confirm_profile_logic, pattern="^prof_edit$")
            ],
            MAN_NAT: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, man_nat),
                CallbackQueryHandler(confirm_profile_logic, pattern="^prof_edit$")
            ],
            MAN_NAT_CONFIRM: [
                CallbackQueryHandler(man_nat_confirm, pattern="^nat_conf_")
            ],
            MAN_PHONE: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, man_phone),
                CallbackQueryHandler(confirm_profile_logic, pattern="^prof_edit$")
            ],
            MAN_ADDRESS: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, man_address),
                CallbackQueryHandler(confirm_profile_logic, pattern="^prof_edit$")
            ],
            CONFIRM_PROFILE: [
                CallbackQueryHandler(confirm_profile_logic, pattern="^prof_"),
                CallbackQueryHandler(handle_profile_edit_selection, pattern="^edit_cancel$")
            ],
            EDIT_PROFILE_MENU: [CallbackQueryHandler(handle_profile_edit_selection, pattern="^edit_")],
            
            SERVICE: [CallbackQueryHandler(service_choice, pattern="^svc_")],
            V_TYPE: [
                CallbackQueryHandler(vaccine_type_selected, pattern="^vtype_"),
                CallbackQueryHandler(restart_service, pattern="^back_start$")
            ],
            V_SELECT: [
                CallbackQueryHandler(vaccine_selected, pattern="^v_"),
                CallbackQueryHandler(route_back_v_type, pattern="^back_v_type$"),
                CallbackQueryHandler(handle_edit_menu_routing, pattern="^back_edit_menu$")
            ],
            V_DOSE: [
                CallbackQueryHandler(vaccine_dose, pattern="^dose_"),
                CallbackQueryHandler(route_back_v_type, pattern="^back_v_type$"),
                CallbackQueryHandler(handle_edit_menu_routing, pattern="^back_edit_menu$")
            ],
            BT_FLOW: [
                CallbackQueryHandler(bt_logic),
                CallbackQueryHandler(route_back_service_details, pattern="^back_bt_pkg$"),
                CallbackQueryHandler(handle_edit_menu_routing, pattern="^back_edit_menu$")
            ],
            DOC_PREF: [
                CallbackQueryHandler(handle_doc_pref, pattern="^doc_"),
                CallbackQueryHandler(route_back_v_type, pattern="^back_v_type$"),
                CallbackQueryHandler(route_back_service_details, pattern="^back_bt_pkg$"),
                CallbackQueryHandler(restart_service, pattern="^back_start$"),
                CallbackQueryHandler(handle_edit_menu_routing, pattern="^back_edit_menu$"),
                MessageHandler(filters.TEXT & ~filters.COMMAND, handle_date_time_selection)
            ],
            DOC_SELECT: [
                CallbackQueryHandler(handle_doc_select, pattern="^docname_"),
                CallbackQueryHandler(show_doctor_preference, pattern="^back_doc_pref$")
            ],
            BOOK_DATE_TIME: [
                CallbackQueryHandler(show_doctor_preference, pattern="^back_doc_pref$"),
                CallbackQueryHandler(handle_edit_menu_routing, pattern="^back_edit_menu$"),
                CallbackQueryHandler(handle_date_time_selection, pattern="^(date_|time_|back_date|sug_)"),
                MessageHandler(filters.TEXT & ~filters.COMMAND, handle_date_time_selection)
            ],
            CONFIRM_BOOK: [CallbackQueryHandler(confirm_booking_logic, pattern="^conf_")],
            EDIT_BOOKING_MENU: [CallbackQueryHandler(handle_booking_edit, pattern="^editbook_")],
            FINAL_HELP: [CallbackQueryHandler(final_help_logic, pattern="^help_")],
            CANCEL_SELECT: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, cancel_select_logic)
            ],
            CANCEL_REASON: [
                CallbackQueryHandler(cancel_reason_logic),
                MessageHandler(filters.TEXT & ~filters.COMMAND, cancel_reason_logic)
            ]
        },
        fallbacks=[CommandHandler('start', start), CommandHandler('cancel', cancel_command)],
        allow_reentry=True
    )
    
    app.add_handler(conv)
    app.add_handler(InlineQueryHandler(inline_query_handler))
    
    logger.info("Bot is starting...")
    app.run_polling()