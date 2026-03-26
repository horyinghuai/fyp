import os
import httpx
import re
import asyncio
import tempfile
import easyocr
from dateutil import parser as date_parser
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, CommandHandler, ContextTypes, 
    CallbackQueryHandler, ConversationHandler, MessageHandler, filters
)

load_dotenv()
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
API_BASE = "http://127.0.0.1:8000"

ocr_reader = None

def get_ocr_reader():
    global ocr_reader
    if ocr_reader is None:
        print("Loading EasyOCR Model for the first time... this may take a moment.")
        ocr_reader = easyocr.Reader(['en', 'ms'])
    return ocr_reader

# Fully mapped States
SERVICE, NAT_CHOICE, MY_METHOD_CHOICE, UPLOAD_IC, MAN_NAME, MAN_IC, MAN_PASSPORT, MAN_GENDER, MAN_NAT, MAN_ADDRESS, MAN_PHONE, CONFIRM_PROFILE, CONFIRM_OCR, V_SELECT, V_DOSE, BT_FLOW, BOOK_DATE, BOOK_TIME, CONFIRM_BOOK, FINAL_HELP = range(20)

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
        if any(sw in text for sw in stop_words) or len(text) < 3:
            continue
        address_lines.append(text)
        
    address = ", ".join(address_lines) if address_lines else "UNKNOWN"
    return name, ic_num, address, gender, nationality

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    btns = [[InlineKeyboardButton("Vaccines", callback_data="svc_Vaccine")],
            [InlineKeyboardButton("Blood Tests", callback_data="svc_Blood Test")],
            [InlineKeyboardButton("Others", callback_data="svc_Others")]]
    msg = "Welcome to the AI Clinic! What service do you need today?"
    if update.message: await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    else: await update.callback_query.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
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
    
    # Restrict OCR to Malaysians only
    if is_my:
        btns = [[InlineKeyboardButton("Upload MyKad", callback_data="meth_photo")],
                [InlineKeyboardButton("Enter Manually", callback_data="meth_manual")]]
        await query.message.reply_text("Would you like to auto-fill your details by uploading your MyKad, or enter them manually?", reply_markup=InlineKeyboardMarkup(btns))
        return MY_METHOD_CHOICE
    else:
        await query.message.reply_text("Please enter your Full Name:")
        return MAN_NAME

async def my_method_logic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data == "meth_photo":
        await query.edit_message_text("Upload MyKad")
        await query.message.reply_text("Please upload a clear photo of your MyKad:")
        return UPLOAD_IC
    else:
        await query.edit_message_text("Enter Manually")
        await query.message.reply_text("Please enter your Full Name:")
        return MAN_NAME

async def handle_ic_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    photo_file = await update.message.photo[-1].get_file()
    fd, path = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)
    await photo_file.download_to_drive(path)
    
    loading_text = "🔍 Analyzing MyKad, please wait..."
    if ocr_reader is None: loading_text = "🔍 Setting up AI scanner for the first time..."
    processing_msg = await update.message.reply_text(loading_text)
    
    try:
        name, ic, address, gender, nationality = await asyncio.to_thread(extract_ic_info, path)
    except Exception as e:
        name, ic, address, gender, nationality = None, None, None, None, None
    finally:
        if os.path.exists(path): os.remove(path)
            
    await processing_msg.delete()
        
    if not ic:
        await update.message.reply_text("❌ Could not detect MyKad. Please upload a clearer photo OR enter your Full Name to proceed manually:")
        return MAN_NAME
        
    context.user_data['ocr_name'] = name
    context.user_data['ocr_ic'] = ic
    context.user_data['ocr_address'] = address
    context.user_data['ocr_gender'] = gender
    context.user_data['ocr_nationality'] = nationality
    
    msg = (f"✅ *Extracted Info*\nName: {name}\nIC: {ic}\nGender: {gender}\n"
           f"Nationality: {nationality}\nAddress: {address}\n\nIs this correct?")
    btns = [[InlineKeyboardButton("Yes, this is correct", callback_data="ocr_yes")],
            [InlineKeyboardButton("No, re-enter manually", callback_data="ocr_no")]]
    await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns), parse_mode="Markdown")
    return CONFIRM_OCR

async def confirm_ocr_logic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == "ocr_no":
        await query.edit_message_text("Let's enter it manually. Please enter your Full Name:")
        return MAN_NAME
        
    await query.edit_message_text("✅ IC Information confirmed.")
    
    ic = context.user_data['ocr_ic']
    context.user_data['ic'] = ic
    context.user_data['name'] = context.user_data['ocr_name']
    context.user_data['address'] = context.user_data['ocr_address']
    context.user_data['gender'] = context.user_data['ocr_gender']
    context.user_data['nationality'] = context.user_data['ocr_nationality']
    
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{API_BASE}/patient/id/{ic}")
        if res.status_code == 200:
            patient = res.json()
            context.user_data['phone'] = patient['phone']
            return await proceed_to_service(update, context)
            
    await query.message.reply_text(f"Welcome {context.user_data['name']}! Please enter your Phone Number:")
    return MAN_PHONE

async def man_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['name'] = update.message.text.upper()
    if context.user_data.get('is_malaysian'):
        await update.message.reply_text("Please enter your IC Number:")
        return MAN_IC
    else:
        await update.message.reply_text("Please enter your Passport Number:")
        return MAN_PASSPORT

async def man_ic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ic_input = update.message.text.upper()
    ic_digits = re.sub(r'\D', '', ic_input)

    if len(ic_digits) != 12:
        await update.message.reply_text("❌ Wrong format! Please enter your IC Number again:")
        return MAN_IC

    formatted_ic = f"{ic_digits[:6]}-{ic_digits[6:8]}-{ic_digits[8:]}"
    context.user_data['ic'] = formatted_ic
    last_digit = int(ic_digits[-1])
    context.user_data['gender'] = "FEMALE" if last_digit % 2 == 0 else "MALE"
    context.user_data['nationality'] = "MALAYSIA"

    await update.message.reply_text("Please enter your Home Address:")
    return MAN_ADDRESS

async def man_passport(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['ic'] = update.message.text.upper()
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
        formatted_phone = f"+60{digits[1:3]}-{digits[3:]}"
        context.user_data['phone'] = formatted_phone
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
    async with httpx.AsyncClient() as client:
        if service == 'Vaccine':
            res = await client.get(f"{API_BASE}/vaccines")
            btns = [[InlineKeyboardButton(f"{v['name']} (RM{float(v['price']):.2f})", callback_data=f"v_{v['name']}")] for v in res.json()]
            msg = "Choose a vaccine:"
            if update.message: await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
            else: await update.callback_query.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
            return V_SELECT
        else:
            return await show_blood_tests(update, context, "package")

async def show_blood_tests(update, context, t_type):
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{API_BASE}/blood-tests/{t_type}")
        tests = res.json()
        selected = context.user_data.get('selected_items', [])
        btns = [[InlineKeyboardButton(f"{t['name']} (RM{float(t['price']):.2f})", callback_data=f"sel_{t['name']}")] for t in tests if t['name'] not in selected]
        if t_type == "package": btns.append([InlineKeyboardButton("OTHERS (Single Tests)", callback_data="bt_others")])
        
        msg = "Choose a package:" if t_type == "package" else "Choose a single test:"
        markup = InlineKeyboardMarkup(btns)
        if update.callback_query: await update.callback_query.message.reply_text(msg, reply_markup=markup)
        else: await update.message.reply_text(msg, reply_markup=markup)
        return BT_FLOW

async def bt_logic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data
    
    if data == "bt_others": 
        await query.edit_message_text("OTHERS (Single Tests)")
        return await show_blood_tests(update, context, "single")
    if data.startswith("sel_"):
        item = data.replace("sel_", "")
        context.user_data['selected_items'].append(item)
        await query.edit_message_text(f"{item}")
        btns = [[InlineKeyboardButton("Yes, add extra", callback_data="add_more"), InlineKeyboardButton("No thanks, finish", callback_data="add_done")]]
        await query.message.reply_text(f"Added: {item}. Would you like to add more tests?", reply_markup=InlineKeyboardMarkup(btns))
        return BT_FLOW
    if data == "add_more": 
        await query.edit_message_text("Yes, add extra")
        return await show_blood_tests(update, context, "single")
    if data == "add_done":
        await query.edit_message_text("No thanks, finish")
        await query.message.reply_text("Please enter your preferred Date:")
        return BOOK_DATE

async def vaccine_selected(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    vaccine = query.data.replace("v_", "")
    context.user_data['selected_items'] = [vaccine]
    await query.edit_message_text(f"{vaccine}")
    
    btns = [[InlineKeyboardButton("Dose 1", callback_data="dose_Dose 1"), 
             InlineKeyboardButton("Dose 2", callback_data="dose_Dose 2")],
            [InlineKeyboardButton("Booster", callback_data="dose_Booster")]]
    await query.message.reply_text("Which dose are you taking?", reply_markup=InlineKeyboardMarkup(btns))
    return V_DOSE

async def vaccine_dose(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    dose = query.data.replace("dose_", "")
    context.user_data['dose'] = dose
    await query.edit_message_text(f"{dose}")
    
    await query.message.reply_text("Please enter your preferred Date:")
    return BOOK_DATE

async def handle_date(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        parsed_date = date_parser.parse(update.message.text, dayfirst=True)
        context.user_data['book_date'] = parsed_date.strftime("%Y-%m-%d")
        await update.message.reply_text("Please enter your preferred Time:")
        return BOOK_TIME
    except Exception:
        await update.message.reply_text("❌ Could not understand the date format. Please try again:")
        return BOOK_DATE

async def handle_time(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        time_text = update.message.text.lower().replace('.', ':')
        parsed_time = date_parser.parse(time_text)
        time_str = parsed_time.strftime("%H:%M:%S")
    except Exception:
        await update.message.reply_text("❌ Could not understand the time format. Please try again:")
        return BOOK_TIME

    full_time_str = f"{context.user_data['book_date']} {time_str}"
    
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{API_BASE}/check-availability", params={"requested_time": full_time_str})
        data = res.json()
    
    if not data['is_valid']:
        sug_str = "\nSuggestions: " + ", ".join(data['suggestions']) if data['suggestions'] else ""
        await update.message.reply_text(f"❌ {data['reason']}{sug_str}\nPlease choose a different Date:")
        return BOOK_DATE 

    context.user_data['book_time'] = full_time_str
    
    name = context.user_data['name']
    ic = context.user_data['ic']
    phone = context.user_data['phone']
    service = context.user_data['service']
    
    if service == 'Vaccine':
        details = f"{context.user_data['selected_items'][0]} ({context.user_data['dose']})"
    else:
        details = ", ".join(context.user_data['selected_items'])

    summary = (f"📋 *Booking Summary*\nName: {name}\nID/IC: {ic}\nPhone: {phone}\n"
               f"Date: {context.user_data['book_date']}\nTime: {time_str}\n"
               f"Service: {service}\nDetails: {details}\n\nIs this information correct?")
    
    btns = [[InlineKeyboardButton("Yes, Confirm", callback_data="conf_yes"), 
             InlineKeyboardButton("No, Rebook", callback_data="conf_no")]]
    await update.message.reply_text(summary, reply_markup=InlineKeyboardMarkup(btns), parse_mode="Markdown")
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
    
    async with httpx.AsyncClient() as client:
        await client.post(f"{API_BASE}/register-patient", json={
            "name": context.user_data['name'], 
            "ic_passport_number": context.user_data['ic'], 
            "phone": context.user_data['phone'], 
            "telegram_id": update.effective_user.id,
            "address": context.user_data.get('address'), 
            "gender": context.user_data.get('gender'), 
            "nationality": context.user_data.get('nationality') 
        })
        
        await client.post(f"{API_BASE}/book-appointment", json={
            "telegram_id": update.effective_user.id,
            "ic_passport_number": context.user_data['ic'], 
            "service_type": context.user_data['service'],
            "details": {"items": context.user_data['selected_items'], "dose": context.user_data.get('dose')},
            "scheduled_time": context.user_data['book_time']
        })
    
    time_str = context.user_data['book_time']
    date_part, time_part = time_str.split(" ")
    service = context.user_data['service']
    if service == 'Vaccine':
        details = f"{context.user_data['selected_items'][0]} ({context.user_data.get('dose')})"
    else:
        details = ", ".join(context.user_data['selected_items'])

    confirmed_summary = (f"✅ *Booking Successfully Confirmed!*\n\n📋 *Confirmed Booking Summary*\n"
                         f"Name: {context.user_data['name']}\nID/IC: {context.user_data['ic']}\n"
                         f"Phone: {context.user_data['phone']}\nDate: {date_part}\nTime: {time_part}\n"
                         f"Service: {service}\nDetails: {details}\n")
    
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
        await query.message.reply_text("Thank you for using AI Clinic. Have a great day!")
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
            MAN_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, man_name)],
            MAN_IC: [MessageHandler(filters.TEXT & ~filters.COMMAND, man_ic)],
            MAN_PASSPORT: [MessageHandler(filters.TEXT & ~filters.COMMAND, man_passport)],
            MAN_GENDER: [MessageHandler(filters.TEXT & ~filters.COMMAND, man_gender)],
            MAN_NAT: [MessageHandler(filters.TEXT & ~filters.COMMAND, man_nat)],
            MAN_ADDRESS: [MessageHandler(filters.TEXT & ~filters.COMMAND, man_address)],
            MAN_PHONE: [MessageHandler(filters.TEXT & ~filters.COMMAND, man_phone)],
            CONFIRM_PROFILE: [CallbackQueryHandler(confirm_profile_logic, pattern="^prof_")],
            CONFIRM_OCR: [CallbackQueryHandler(confirm_ocr_logic, pattern="^ocr_")],
            V_SELECT: [CallbackQueryHandler(vaccine_selected, pattern="^v_")],
            V_DOSE: [CallbackQueryHandler(vaccine_dose, pattern="^dose_")],
            BT_FLOW: [CallbackQueryHandler(bt_logic)],
            BOOK_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_date)],
            BOOK_TIME: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_time)],
            CONFIRM_BOOK: [CallbackQueryHandler(process_confirmation, pattern="^conf_")],
            FINAL_HELP: [CallbackQueryHandler(final_help_logic, pattern="^help_")],
        },
        fallbacks=[CommandHandler('start', start)],
    )
    app.add_handler(conv)
    app.run_polling()