import os
import httpx
import re
import asyncio
import tempfile
import easyocr
import json
import datetime as dt
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, CommandHandler, ContextTypes, 
    CallbackQueryHandler, ConversationHandler, MessageHandler, filters
)

load_dotenv()
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
API_BASE = "http://127.0.0.1:8000"
CLINIC_ID = os.getenv("CLINIC_ID")

ocr_reader = None
def get_ocr_reader():
    global ocr_reader
    if ocr_reader is None: ocr_reader = easyocr.Reader(['en', 'ms'])
    return ocr_reader

SERVICE, NAT_CHOICE, MY_METHOD_CHOICE, UPLOAD_IC, MAN_ID_CHECK, MAN_NAME, MAN_GENDER, MAN_NAT, MAN_ADDRESS, MAN_PHONE, CONFIRM_PROFILE, V_SELECT, V_DOSE, BT_FLOW, DOC_PREF, DOC_SELECT, BOOK_DATE_TIME, CONFIRM_BOOK, FINAL_HELP = range(19)

# --- DYNAMIC CALENDARS ---
async def generate_date_picker(service, doctor_pref):
    duration = 15 if service == 'Vaccine' else 30
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{API_BASE}/available-dates", json={"clinic_id": CLINIC_ID, "duration": duration, "doctor_pref": doctor_pref})
        valid_dates = res.json() if res.status_code == 200 else []
        
    keyboard = []
    row = []
    for d_str in valid_dates:
        d_obj = dt.datetime.strptime(d_str, "%Y-%m-%d")
        row.append(InlineKeyboardButton(d_obj.strftime("%d %b %Y"), callback_data=f"date_{d_str}"))
        if len(row) == 2:
            keyboard.append(row)
            row = []
    if row: keyboard.append(row)
    # ADDED BACK BUTTON
    keyboard.append([InlineKeyboardButton("🔙 Back", callback_data="back_doc_pref")])
    return InlineKeyboardMarkup(keyboard)

async def generate_time_picker(service, date_str, doctor_pref):
    duration = 15 if service == 'Vaccine' else 30
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{API_BASE}/available-times", json={"clinic_id": CLINIC_ID, "date": date_str, "duration": duration, "doctor_pref": doctor_pref})
        data = res.json() if res.status_code == 200 else {}
        
    valid_times = data.get("times", [])
    assigned_doc = data.get("doctor_name", "a doctor")
    assigned_doc_id = data.get("doctor_id")
    
    keyboard = []
    row = []
    for t_str in valid_times:
        row.append(InlineKeyboardButton(t_str[:5], callback_data=f"time_{t_str}"))
        if len(row) == 3:
            keyboard.append(row)
            row = []
    if row: keyboard.append(row)
    # ADDED BACK BUTTON
    keyboard.append([InlineKeyboardButton("🔙 Back to Date Selection", callback_data="back_date")])
    
    return InlineKeyboardMarkup(keyboard), assigned_doc, assigned_doc_id

# --- OCR ENGINE ---
def extract_ic_info(image_path: str):
    reader = get_ocr_reader()
    results = reader.readtext(image_path)
    if not results: return None, None, None, None, None
    results = sorted(results, key=lambda r: r[0][0][1])
    ic_num = None
    ic_index = -1
    ic_pattern = re.compile(r'\d{6}-\d{2}-\d{4}')
    cleaned_results = [(bbox, text.upper().strip(), prob) for bbox, text, prob in results]

    for i, (bbox, text, prob) in enumerate(cleaned_results):
        match = ic_pattern.search(text)
        if match:
            ic_num = match.group(0)
            ic_index = i
            break

    if not ic_num: return None, None, None, None, None
    last_digit = int(ic_num[-1])
    gender = "FEMALE" if last_digit % 2 == 0 else "MALE"

    nationality = "UNKNOWN"
    for _, text, _ in cleaned_results:
        if "WARGANEGARA" in text or "WARGA" in text or "NEGARA" in text:
            nationality = "MALAYSIA"
            break

    name = "UNKNOWN"
    address_start_idx = ic_index + 1
    if ic_index + 1 < len(cleaned_results):
        raw_name = cleaned_results[ic_index + 1][1]
        name = re.sub(r'[^A-Z\s]', '', raw_name).strip()
        address_start_idx = ic_index + 2

    address_lines = []
    stop_words = ["ISLAM", "LELAKI", "PEREMPUAN", "BUDDHA", "HINDU", "KRISTIAN", "WARGANEGARA", "WARGA", "NEGARA"]
    for i in range(address_start_idx, len(cleaned_results)):
        text = cleaned_results[i][1]
        if any(sw in text for sw in stop_words) or len(text) < 3: continue
        address_lines.append(text)
        
    address = ", ".join(address_lines) if address_lines else "UNKNOWN"
    return name, ic_num, address, gender, nationality

# --- REUSABLE BACK HELPERS ---
async def restart_service(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    if query: await query.answer()
    
    clinic_name = context.user_data.get('clinic_name', 'our Clinic')
    btns = [[InlineKeyboardButton("Vaccines", callback_data="svc_Vaccine")],
            [InlineKeyboardButton("Blood Tests", callback_data="svc_Blood Test")],
            [InlineKeyboardButton("Others", callback_data="svc_Others")]]
            
    msg = f"Welcome to {clinic_name}!\n\nWhat service do you need today?"
    if query: await query.edit_message_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    else: await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    return SERVICE

async def route_back_service_details(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    service = context.user_data.get('service')
    
    if service == 'Vaccine':
        vaccine_name = context.user_data['selected_items'][0]
        return await render_v_dose_menu(update, context, vaccine_name)
    elif service == 'Blood Test':
        # Reset BT selection cleanly if moving backwards
        context.user_data['selected_items'] = []
        return await show_blood_tests(update, context, "package")
    else:
        return await restart_service(update, context)

# --- MAIN FLOW ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    clinic_name = "our Clinic"
    if CLINIC_ID:
        async with httpx.AsyncClient() as client:
            try:
                res = await client.get(f"{API_BASE}/clinic/{CLINIC_ID}")
                if res.status_code == 200: clinic_name = res.json().get('name', 'our Clinic')
            except: pass
            
    context.user_data['clinic_name'] = clinic_name
    btns = [[InlineKeyboardButton("Vaccines", callback_data="svc_Vaccine")],
            [InlineKeyboardButton("Blood Tests", callback_data="svc_Blood Test")],
            [InlineKeyboardButton("Others", callback_data="svc_Others")]]
            
    if update.message: 
        await update.message.reply_text(f"Welcome to {clinic_name}!")
        await update.message.reply_text("What service do you need today?", reply_markup=InlineKeyboardMarkup(btns))
    else: 
        await update.callback_query.message.reply_text(f"Welcome to {clinic_name}!")
        await update.callback_query.message.reply_text("What service do you need today?", reply_markup=InlineKeyboardMarkup(btns))
    return SERVICE

async def service_choice(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    service = query.data.replace("svc_", "")
    context.user_data['service'] = service
    await query.edit_message_text(f"{service}")
    
    btns = [[InlineKeyboardButton("Malaysian", callback_data="nat_my")],
            [InlineKeyboardButton("Non-Malaysian", callback_data="nat_non")]]
    await query.message.reply_text("Please select your nationality:", reply_markup=InlineKeyboardMarkup(btns))
    return NAT_CHOICE

async def nat_choice_logic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    is_my = (query.data == "nat_my")
    context.user_data['is_malaysian'] = is_my
    await query.edit_message_text("Malaysian" if is_my else "Non-Malaysian")
    
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
        await query.edit_message_text("Upload MyKad")
        await query.message.reply_text("Please upload a clear photo of your MyKad:")
        return UPLOAD_IC
    else:
        await query.edit_message_text("Enter Manually")
        await query.message.reply_text("Please enter your IC Number (Format: XXXXXXXXXXXX or XXXXXX-XX-XXXX):")
        return MAN_ID_CHECK

async def handle_ic_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    photo_file = await update.message.photo[-1].get_file()
    fd, path = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)
    await photo_file.download_to_drive(path)
    
    processing_msg = await update.message.reply_text("🔍 Analyzing MyKad, please wait...")
    try: name, ic, address, gender, nationality = await asyncio.to_thread(extract_ic_info, path)
    except Exception: name, ic, address, gender, nationality = None, None, None, None, None
    finally:
        if os.path.exists(path): os.remove(path)
            
    await processing_msg.delete()
        
    if not ic:
        await update.message.reply_text("❌ Could not detect MyKad. Please enter your IC Number manually:")
        return MAN_ID_CHECK
        
    context.user_data['name'] = name
    context.user_data['ic'] = ic
    context.user_data['address'] = address
    context.user_data['gender'] = gender
    context.user_data['nationality'] = nationality
    
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{API_BASE}/patient/{CLINIC_ID}/id/{ic}")
        if res.status_code == 200:
            patient = res.json()
            context.user_data['phone'] = patient['phone']
            return await proceed_to_service(update, context)

    await update.message.reply_text("✅ MyKad Scanned! Please enter your Phone Number to confirm your profile:")
    return MAN_PHONE

async def man_id_check(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text.upper()
    is_my = context.user_data.get('is_malaysian')

    if is_my:
        ic_digits = re.sub(r'\D', '', text)
        if len(ic_digits) != 12:
            await update.message.reply_text("❌ Wrong format! Please enter your IC Number again:")
            return MAN_ID_CHECK
        formatted_id = f"{ic_digits[:6]}-{ic_digits[6:8]}-{ic_digits[8:]}"
        context.user_data['ic'] = formatted_id
        context.user_data['gender'] = "FEMALE" if int(ic_digits[-1]) % 2 == 0 else "MALE"
        context.user_data['nationality'] = "MALAYSIA"
    else:
        context.user_data['ic'] = text

    async with httpx.AsyncClient() as client:
        res = await client.get(f"{API_BASE}/patient/{CLINIC_ID}/id/{context.user_data['ic']}")
        if res.status_code == 200:
            patient = res.json()
            context.user_data['name'] = patient['name']
            context.user_data['phone'] = patient['phone']
            await update.message.reply_text(f"Welcome back, {patient['name']}! Let's continue.")
            return await proceed_to_service(update, context)

    await update.message.reply_text("Please enter your Full Name:")
    return MAN_NAME

async def man_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['name'] = update.message.text.upper()
    if context.user_data.get('is_malaysian'):
        await update.message.reply_text("Please enter your Home Address:")
        return MAN_ADDRESS
    else:
        await update.message.reply_text("Please enter your Gender (Male / Female):")
        return MAN_GENDER

async def man_gender(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['gender'] = update.message.text.upper()
    await update.message.reply_text("Please enter your Nationality:")
    return MAN_NAT

async def man_nat(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['nationality'] = update.message.text.upper()
    await update.message.reply_text("Please enter your Home Address:")
    return MAN_ADDRESS

async def man_address(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['address'] = update.message.text.upper()
    await update.message.reply_text("Please enter your Phone Number:")
    return MAN_PHONE

async def man_phone(update: Update, context: ContextTypes.DEFAULT_TYPE):
    phone_input = update.message.text.upper()
    digits = re.sub(r'\D', '', phone_input)
    if digits.startswith('60'): digits = '0' + digits[2:]

    if digits.startswith('01') and len(digits) in [10, 11]:
        context.user_data['phone'] = f"+60{digits[1:3]}-{digits[3:]}"
    else:
        await update.message.reply_text("❌ Wrong format! Please enter your phone number again:")
        return MAN_PHONE

    msg = (f"📋 *Please confirm your details:*\nName: {context.user_data['name']}\n"
           f"ID Number: {context.user_data['ic']}\nGender: {context.user_data['gender']}\n"
           f"Nationality: {context.user_data['nationality']}\nAddress: {context.user_data['address']}\n"
           f"Phone: {context.user_data['phone']}\n\nIs this correct?")
    btns = [[InlineKeyboardButton("Yes, this is correct", callback_data="prof_yes")],
            [InlineKeyboardButton("No, re-enter details", callback_data="prof_no")]]
    await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns), parse_mode="Markdown")
    return CONFIRM_PROFILE

async def confirm_profile_logic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == "prof_no":
        await query.edit_message_text("Let's try again. Please enter your Full Name:")
        return MAN_NAME
    await query.edit_message_text("✅ Profile confirmed.")
    return await proceed_to_service(update, context)

async def proceed_to_service(update, context):
    service = context.user_data['service']
    context.user_data['selected_items'] = []
    
    if service == 'Others':
        return await show_doctor_preference(update, context)

    async with httpx.AsyncClient() as client:
        if service == 'Vaccine':
            res = await client.get(f"{API_BASE}/vaccines/{CLINIC_ID}")
            vaccines = res.json()
            context.user_data['vaccines_list'] = vaccines
            btns = [[InlineKeyboardButton(f"{v['name']} (RM{float(v['price']):.2f})", callback_data=f"v_{v['name']}")] for v in vaccines]
            btns.append([InlineKeyboardButton("🔙 Back to Services", callback_data="back_start")])
            msg = "Choose a vaccine:"
            if update.callback_query: await update.callback_query.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
            else: await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
            return V_SELECT
        elif service == 'Blood Test':
            return await show_blood_tests(update, context, "package")

# Separated Vaccine render logic so Back buttons work perfectly
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
    btns.append([InlineKeyboardButton("🔙 Back to Vaccines", callback_data="back_v_select")])
    
    msg = "Which dose are you taking?"
    if update.callback_query: await update.callback_query.edit_message_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    else: await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    return V_DOSE

async def vaccine_selected(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    vaccine_name = query.data.replace("v_", "")
    context.user_data['selected_items'] = [vaccine_name]
    return await render_v_dose_menu(update, context, vaccine_name)

async def vaccine_dose(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    context.user_data['dose'] = query.data.replace("dose_", "")
    await query.edit_message_text(f"{context.user_data['dose']}")
    return await show_doctor_preference(update, context)

async def show_blood_tests(update, context, t_type):
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{API_BASE}/blood-tests/{CLINIC_ID}/{t_type}")
        tests = res.json()
        context.user_data[f'bt_cache_{t_type}'] = tests
        
        selected_names = context.user_data.get('selected_items', [])
        excluded_singles = set(selected_names)

        if t_type == 'single':
            pkg_cache = context.user_data.get('bt_cache_package', [])
            for pkg in pkg_cache:
                if pkg['name'] in selected_names:
                    included = pkg.get('included_tests', [])
                    if isinstance(included, str):
                        try: included = json.loads(included)
                        except: pass
                    excluded_singles.update(included)
        
        btns = []
        for t in tests:
            if t['name'] not in excluded_singles:
                btns.append([InlineKeyboardButton(f"{t['name']} (RM{float(t['price']):.2f})", callback_data=f"selbt_{t['id']}")])
        
        if t_type == "package": 
            btns.append([InlineKeyboardButton("OR Browse Single Tests", callback_data="bt_others")])
            btns.append([InlineKeyboardButton("🔙 Back to Services", callback_data="back_start")])
            msg = "Choose a Blood Test Package:"
        else:
            btns.append([InlineKeyboardButton("🔙 Back to Packages", callback_data="back_bt_pkg")])
            msg = "Choose an add-on Single Test:"
            
        markup = InlineKeyboardMarkup(btns)
        if update.callback_query:
            try: await update.callback_query.edit_message_text(msg, reply_markup=markup)
            except: await update.callback_query.message.reply_text(msg, reply_markup=markup)
        else: await update.message.reply_text(msg, reply_markup=markup)
        return BT_FLOW

async def bt_logic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data
    
    if data == "back_start": return await restart_service(update, context)
    if data == "back_bt_pkg": return await show_blood_tests(update, context, "package")
    
    if data == "bt_others": 
        await query.edit_message_text("Browse Single Tests")
        return await show_blood_tests(update, context, "single")
        
    if data.startswith("selbt_"):
        bt_id = int(data.replace("selbt_", ""))
        bt_name = "Unknown Test"
        for t_type in ['package', 'single']:
            cache = context.user_data.get(f'bt_cache_{t_type}', [])
            for t in cache:
                if t['id'] == bt_id:
                    bt_name = t['name']
                    break
                    
        context.user_data['selected_items'].append(bt_name)
        await query.edit_message_text(f"{bt_name}")
        
        btns = [[InlineKeyboardButton("Yes, add more", callback_data="add_more"), InlineKeyboardButton("No thanks, finish", callback_data="add_done")]]
        await query.message.reply_text(f"Added: {bt_name}. Would you like to add any single tests?", reply_markup=InlineKeyboardMarkup(btns))
        return BT_FLOW
        
    if data == "add_more": 
        await query.edit_message_text("Yes, add more")
        return await show_blood_tests(update, context, "single")
        
    if data == "add_done":
        await query.edit_message_text("No thanks, finish")
        return await show_doctor_preference(update, context)

# --- DOCTOR PREFERENCES ---
async def show_doctor_preference(update: Update, context: ContextTypes.DEFAULT_TYPE):
    btns = [
        [InlineKeyboardButton("Any Doctor", callback_data="doc_ANY")],
        [InlineKeyboardButton("Male Doctor", callback_data="doc_MALE"), InlineKeyboardButton("Female Doctor", callback_data="doc_FEMALE")],
        [InlineKeyboardButton("Specific Doctor", callback_data="doc_SPECIFIC")],
        [InlineKeyboardButton("🔙 Back", callback_data="back_service_details")]
    ]
    msg = "Do you have a doctor preference?"
    if update.callback_query: await update.callback_query.edit_message_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    else: await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    return DOC_PREF

async def handle_doc_pref(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    pref = query.data.replace("doc_", "")
    
    if pref == "SPECIFIC":
        await query.edit_message_text("Specific Doctor")
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{API_BASE}/doctors/{CLINIC_ID}")
            doctors = res.json()
        btns = [[InlineKeyboardButton(d['name'], callback_data=f"docname_{d['name']}")] for d in doctors]
        btns.append([InlineKeyboardButton("🔙 Back to Doctor Preference", callback_data="back_doc_pref")])
        await query.message.reply_text("Please choose a doctor:", reply_markup=InlineKeyboardMarkup(btns))
        return DOC_SELECT
    else:
        context.user_data['doctor_pref'] = pref
        await query.edit_message_text(f"{pref.title()} Doctor")
        await trigger_datetime_prompt(update, context)
        return BOOK_DATE_TIME

async def handle_doc_select(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    name = query.data.replace("docname_", "")
    context.user_data['doctor_pref'] = name
    await query.edit_message_text(name)
    await trigger_datetime_prompt(update, context)
    return BOOK_DATE_TIME

async def trigger_datetime_prompt(update: Update, context: ContextTypes.DEFAULT_TYPE):
    service = context.user_data['service']
    doctor_pref = context.user_data.get('doctor_pref', 'ANY')
    markup = await generate_date_picker(service, doctor_pref)
    
    if service in ['Vaccine', 'Blood Test']:
        msg = "Please select a Date below, \nOR type your request (e.g., 'Tomorrow at 10am'):"
    else:
        msg = "Please select a Date below, \nOR type your request naturally (e.g., 'Tomorrow at 10am for fever'):"
        
    if update.callback_query: await update.callback_query.message.reply_text(msg, reply_markup=markup)
    elif update.message: await update.message.reply_text(msg, reply_markup=markup)

# --- DATE / TIME & AI ---
async def handle_date_time_selection(update: Update, context: ContextTypes.DEFAULT_TYPE):
    service = context.user_data['service']
    doctor_pref = context.user_data.get('doctor_pref', 'ANY')

    if update.callback_query:
        query = update.callback_query
        await query.answer()
        data = query.data

        if data.startswith("date_"):
            context.user_data['book_date'] = data.replace("date_", "")
            markup, assigned_name, assigned_id = await generate_time_picker(service, context.user_data['book_date'], doctor_pref)
            
            context.user_data['assigned_doctor_name'] = assigned_name
            context.user_data['assigned_doctor_id'] = assigned_id
            
            await query.edit_message_text(f"Assigned to {assigned_name}. Now, please select your preferred Time:", reply_markup=markup)
            return BOOK_DATE_TIME

        elif data == "back_date":
            markup = await generate_date_picker(service, doctor_pref)
            if service in ['Vaccine', 'Blood Test']: msg = "Please select a Date below, \nOR type your request (e.g., 'Tomorrow at 10am'):"
            else: msg = "Please select a Date below, \nOR type your request naturally (e.g., 'Tomorrow at 10am for fever'):"
            await query.edit_message_text(msg, reply_markup=markup)
            return BOOK_DATE_TIME

        elif data.startswith("time_"):
            time_str = data.replace("time_", "")
            full_time_str = f"{context.user_data['book_date']} {time_str}"
            return await process_availability(update, context, full_time_str)

        elif data.startswith("sug_"):
            full_time_str = data.replace("sug_", "")
            context.user_data['book_date'] = full_time_str.split(" ")[0]
            return await process_availability(update, context, full_time_str)

    elif update.message and update.message.text:
        text = update.message.text
        processing_msg = await update.message.reply_text("🤖 AI is reading your request...")
        
        async with httpx.AsyncClient() as client:
            res = await client.post(f"{API_BASE}/ai-extract", json={"text": text})
            
        await processing_msg.delete()
        
        if res.status_code == 200:
            ext = res.json()
            if "error" in ext:
                markup = await generate_date_picker(service, doctor_pref)
                if service in ['Vaccine', 'Blood Test']: msg = f"⚠️ AI Process Error: {ext['error']}\n\nPlease select a Date below, \nOR type your request (e.g., 'Tomorrow at 10am'):"
                else: msg = f"⚠️ AI Process Error: {ext['error']}\n\nPlease select a Date below, \nOR type your request naturally (e.g., 'Tomorrow at 10am for fever'):"
                await update.message.reply_text(msg, reply_markup=markup)
                return BOOK_DATE_TIME

            if ext.get('intent') == 'reschedule':
                await update.message.reply_text("I see you want to reschedule. Currently, this bot focuses on new bookings. Let's make a new booking!")
            
            date_pref = ext.get('date_preference')
            time_pref = ext.get('time_preference')
            
            if ext.get('doctor_preference'): context.user_data['doctor_pref'] = ext.get('doctor_preference')
            if ext.get('reason'): context.user_data['reason'] = ext.get('reason')
            
            if date_pref and time_pref:
                full_time_str = f"{date_pref} {time_pref}"
                context.user_data['book_date'] = date_pref
                return await process_availability(update, context, full_time_str)
            elif date_pref:
                context.user_data['book_date'] = date_pref
                markup, assigned_name, assigned_id = await generate_time_picker(service, date_pref, context.user_data.get('doctor_pref'))
                context.user_data['assigned_doctor_name'] = assigned_name
                context.user_data['assigned_doctor_id'] = assigned_id
                
                await update.message.reply_text(f"I understood you want {date_pref}. What time for {assigned_name}?", reply_markup=markup)
                return BOOK_DATE_TIME
            else:
                markup = await generate_date_picker(service, context.user_data.get('doctor_pref'))
                if service in ['Vaccine', 'Blood Test']: msg = "I couldn't fully extract the date and time.\nPlease select a Date below, \nOR type your request (e.g., 'Tomorrow at 10am'):"
                else: msg = "I couldn't fully extract the date and time.\nPlease select a Date below, \nOR type your request naturally (e.g., 'Tomorrow at 10am for fever'):"
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
        res = await client.post(f"{API_BASE}/check-availability", json=payload)
        data = res.json()
    
    if not data['is_valid']:
        sugs = data.get('suggestions', [])
        btns = [[InlineKeyboardButton(s, callback_data=f"sug_{s}")] for s in sugs]
        btns.append([InlineKeyboardButton("📅 Choose Another Time", callback_data="back_date")])
        
        msg = f"❌ {data['reason']}"
        if sugs: msg += "\nHere are alternative slots:"
        
        if update.callback_query: await update.callback_query.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
        else: await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
        return BOOK_DATE_TIME

    context.user_data['book_time'] = full_time_str
    
    if 'doctor_name' in data:
        context.user_data['assigned_doctor_name'] = data['doctor_name']
        context.user_data['assigned_doctor_id'] = data['doctor_id']

    name = context.user_data['name']
    ic = context.user_data['ic']
    phone = context.user_data['phone']
    
    if service == 'Vaccine': details = f"{context.user_data['selected_items'][0]} ({context.user_data.get('dose')})"
    elif service == 'Blood Test': details = ", ".join(context.user_data['selected_items'])
    else: details = f"Reason: {context.user_data.get('reason', 'General Consultation')}"
        
    doc_text = f"\nDoctor: {context.user_data.get('assigned_doctor_name', 'Assigned dynamically')}"

    summary = (f"📋 *Booking Summary*\nName: {name}\nID/IC: {ic}\nPhone: {phone}\n"
               f"Date: {context.user_data['book_date']}\nTime: {full_time_str.split(' ')[1]}\n"
               f"Service: {service}\nDetails: {details}{doc_text}\n\nIs this information correct?")
    
    btns = [[InlineKeyboardButton("Yes, Confirm", callback_data="conf_yes"), InlineKeyboardButton("No, Rebook", callback_data="conf_no")]]
    
    if update.callback_query: await update.callback_query.message.reply_text(summary, reply_markup=InlineKeyboardMarkup(btns), parse_mode="Markdown")
    else: await update.message.reply_text(summary, reply_markup=InlineKeyboardMarkup(btns), parse_mode="Markdown")
    return CONFIRM_BOOK

async def process_confirmation(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data == "conf_no":
        await query.edit_message_text("No, Rebook")
        btns = [[InlineKeyboardButton("Vaccines", callback_data="svc_Vaccine")],
                [InlineKeyboardButton("Blood Tests", callback_data="svc_Blood Test")],
                [InlineKeyboardButton("Others", callback_data="svc_Others")]]
        await query.message.reply_text("No problem. Let's start over.\nWhat service do you need today?", reply_markup=InlineKeyboardMarkup(btns))
        return SERVICE

    await query.edit_message_text("Yes, Confirm")
    
    vaccines = context.user_data.get('vaccines_list', [])
    selected_vac_name = context.user_data.get('selected_items', [None])[0] if context.user_data.get('selected_items') else None
    selected_vac = next((v for v in vaccines if v['name'] == selected_vac_name), None)
    total_doses = selected_vac.get('total_doses', 1) if selected_vac else 1

    details_block = {
        "items": context.user_data.get('selected_items', []), 
        "dose": context.user_data.get('dose'),
        "total_doses": total_doses,
        "reason": context.user_data.get('reason'),
        "doctor_pref": context.user_data.get('doctor_pref', 'ANY'),
        "assigned_doctor_name": context.user_data.get('assigned_doctor_name'),
        "assigned_doctor_id": context.user_data.get('assigned_doctor_id')
    }

    async with httpx.AsyncClient() as client:
        await client.post(f"{API_BASE}/register-patient", json={
            "clinic_id": CLINIC_ID, "name": context.user_data['name'], "ic_passport_number": context.user_data['ic'], 
            "phone": context.user_data['phone'], "telegram_id": update.effective_user.id,
            "address": context.user_data.get('address'), "gender": context.user_data.get('gender'), "nationality": context.user_data.get('nationality') 
        })
        
        await client.post(f"{API_BASE}/book-appointment", json={
            "clinic_id": CLINIC_ID, "telegram_id": update.effective_user.id, "ic_passport_number": context.user_data['ic'], 
            "service_type": context.user_data['service'], "details": details_block, "scheduled_time": context.user_data['book_time']
        })
    
    time_str = context.user_data['book_time']
    date_part, time_part = time_str.split(" ")
    service = context.user_data['service']
    
    if service == 'Vaccine': details = f"{context.user_data['selected_items'][0]} ({context.user_data.get('dose')})"
    elif service == 'Blood Test': details = ", ".join(context.user_data['selected_items'])
    else: details = f"Reason: {context.user_data.get('reason', 'General Consultation')}"
        
    doc_text = f"\nDoctor: {context.user_data.get('assigned_doctor_name', 'Assigned dynamically')}"

    confirmed_summary = (f"✅ *Booking Successfully Confirmed!*\n\n📋 *Confirmed Booking Summary*\n"
                         f"Name: {context.user_data['name']}\nID/IC: {context.user_data['ic']}\n"
                         f"Phone: {context.user_data['phone']}\nDate: {date_part}\nTime: {time_part}\n"
                         f"Service: {service}\nDetails: {details}{doc_text}\n")
    
    await query.message.reply_text(confirmed_summary, parse_mode="Markdown")
    btns = [[InlineKeyboardButton("Yes", callback_data="help_yes"), InlineKeyboardButton("No, I'm done", callback_data="help_no")]]
    await query.message.reply_text("Is there anything else I can help you with?", reply_markup=InlineKeyboardMarkup(btns))
    return FINAL_HELP

async def final_help_logic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == "help_yes":
        await query.edit_message_text("Yes")
        btns = [[InlineKeyboardButton("Vaccines", callback_data="svc_Vaccine")],
                [InlineKeyboardButton("Blood Tests", callback_data="svc_Blood Test")],
                [InlineKeyboardButton("Others", callback_data="svc_Others")]]
        await query.message.reply_text("What service do you need today?", reply_markup=InlineKeyboardMarkup(btns))
        return SERVICE
    else:
        await query.edit_message_text("No, I'm done")
        clinic_name = context.user_data.get('clinic_name', 'our Clinic')
        await query.message.reply_text(f"Thank you for using {clinic_name}. Have a great day!")
        return ConversationHandler.END

if __name__ == '__main__':
    app = ApplicationBuilder().token(TOKEN).build()
    
    conv = ConversationHandler(
        entry_points=[CommandHandler('start', start)],
        states={
            SERVICE: [CallbackQueryHandler(service_choice, pattern="^svc_")],
            NAT_CHOICE: [CallbackQueryHandler(nat_choice_logic, pattern="^nat_")],
            MY_METHOD_CHOICE: [CallbackQueryHandler(my_method_logic, pattern="^meth_")],
            UPLOAD_IC: [MessageHandler(filters.PHOTO, handle_ic_photo)],
            MAN_ID_CHECK: [MessageHandler(filters.TEXT & ~filters.COMMAND, man_id_check)],
            MAN_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, man_name)],
            MAN_GENDER: [MessageHandler(filters.TEXT & ~filters.COMMAND, man_gender)],
            MAN_NAT: [MessageHandler(filters.TEXT & ~filters.COMMAND, man_nat)],
            MAN_ADDRESS: [MessageHandler(filters.TEXT & ~filters.COMMAND, man_address)],
            MAN_PHONE: [MessageHandler(filters.TEXT & ~filters.COMMAND, man_phone)],
            CONFIRM_PROFILE: [CallbackQueryHandler(confirm_profile_logic, pattern="^prof_")],
            V_SELECT: [
                CallbackQueryHandler(vaccine_selected, pattern="^v_"),
                CallbackQueryHandler(restart_service, pattern="^back_start$")
            ],
            V_DOSE: [
                CallbackQueryHandler(vaccine_dose, pattern="^dose_"),
                CallbackQueryHandler(proceed_to_service, pattern="^back_v_select$")
            ],
            BT_FLOW: [CallbackQueryHandler(bt_logic)],
            DOC_PREF: [
                CallbackQueryHandler(handle_doc_pref, pattern="^doc_"),
                CallbackQueryHandler(route_back_service_details, pattern="^back_service_details$")
            ],
            DOC_SELECT: [
                CallbackQueryHandler(handle_doc_select, pattern="^docname_"),
                CallbackQueryHandler(show_doctor_preference, pattern="^back_doc_pref$")
            ],
            BOOK_DATE_TIME: [
                CallbackQueryHandler(show_doctor_preference, pattern="^back_doc_pref$"),
                CallbackQueryHandler(handle_date_time_selection, pattern="^(date_|time_|back_date|sug_)"),
                MessageHandler(filters.TEXT & ~filters.COMMAND, handle_date_time_selection)
            ],
            CONFIRM_BOOK: [CallbackQueryHandler(process_confirmation, pattern="^conf_")],
            FINAL_HELP: [CallbackQueryHandler(final_help_logic, pattern="^help_")],
        },
        fallbacks=[CommandHandler('start', start)],
    )
    app.add_handler(conv)
    app.run_polling()