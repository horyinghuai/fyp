import os
import httpx
import re
import asyncio
import tempfile
import easyocr
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, CommandHandler, ContextTypes, 
    CallbackQueryHandler, ConversationHandler, MessageHandler, filters
)

load_dotenv()
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
API_BASE = "http://127.0.0.1:8000"

# Initialize EasyOCR Reader globally so it doesn't reload on every upload
ocr_reader = easyocr.Reader(['en', 'ms'])

# States (Added CONFIRM_OCR)
SERVICE, IC_ENTRY, CONFIRM_OCR, REG_NAME, REG_PHONE, V_SELECT, V_DOSE, BT_FLOW, BOOK_TIME, CONFIRM_BOOK, FINAL_HELP = range(11)

def extract_ic_info(image_path: str):
    """Modular function to extract MyKad info using EasyOCR & Heuristics."""
    results = ocr_reader.readtext(image_path)
    if not results:
        return None, None, None
        
    # Sort vertically to read top-to-bottom
    results = sorted(results, key=lambda r: r[0][0][1])
    
    ic_num = None
    ic_index = -1
    ic_pattern = re.compile(r'\d{6}-\d{2}-\d{4}')

    # 1. Find IC Number
    for i, (bbox, text, prob) in enumerate(results):
        match = ic_pattern.search(text)
        if match:
            ic_num = match.group(0)
            ic_index = i
            break

    if not ic_num:
        return None, None, None

    # 2. Heuristic for Name (Usually the immediate lines preceding the IC)
    ignore_words = ["MALAYSIA", "KAD", "PENGENALAN", "WARGANEGARA", "IDENTITY", "CARD"]
    name = "Unknown"
    for i in range(ic_index - 1, -1, -1):
        text = results[i][1].upper().strip()
        # Ensure it has chars and is not a header word
        if len(text) > 3 and not any(w in text for w in ignore_words):
            name = text
            break

    # 3. Heuristic for Address (Usually the lines immediately following the IC)
    address_lines = []
    stop_words = ["ISLAM", "LELAKI", "PEREMPUAN", "BUDDHA", "HINDU", "KRISTIAN"]
    for i in range(ic_index + 1, min(ic_index + 6, len(results))):
        text = results[i][1].upper().strip()
        if text in stop_words or "KUMPULAN DARAH" in text:
            break
        address_lines.append(text)
        
    address = ", ".join(address_lines) if address_lines else "Unknown"

    return name, ic_num, address


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    btns = [[InlineKeyboardButton("Vaccines", callback_data="svc_Vaccine")],
            [InlineKeyboardButton("Blood Tests", callback_data="svc_Blood Test")],
            [InlineKeyboardButton("Others", callback_data="svc_Others")]]
    msg = "Welcome to the AI Clinic! What service do you need today?"
    if update.message:
        await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    else:
        await update.callback_query.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns))
    return SERVICE

async def service_choice(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    service = query.data.replace("svc_", "")
    context.user_data['service'] = service
    
    await query.edit_message_text(f"{service}")
    # Prompt user for text or photo
    await query.message.reply_text("Please enter your IC Number (Format: XXXXXX-XX-XXXX) \nOR \nUpload a clear photo of your MyKad:")
    return IC_ENTRY

async def ic_check(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ic = update.message.text
    if not re.match(r"^\d{6}-\d{2}-\d{4}$", ic):
        await update.message.reply_text("❌ Wrong format! Please enter your IC number again (Format: XXXXXX-XX-XXXX):")
        return IC_ENTRY
    
    context.user_data['ic'] = ic
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{API_BASE}/patient/ic/{ic}")
        if res.status_code == 200:
            patient = res.json()
            context.user_data['name'] = patient['name']
            context.user_data['phone'] = patient['phone']
            context.user_data['address'] = patient.get('address')
            return await proceed_to_service(update, context)
        
    await update.message.reply_text("New user detected. Please enter your Full Name:")
    return REG_NAME

async def handle_ic_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    photo_file = await update.message.photo[-1].get_file()
    
    # Download file to a temporary location
    fd, path = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)
    
    await photo_file.download_to_drive(path)
    processing_msg = await update.message.reply_text("🔍 Analyzing MyKad, please wait...")
    
    try:
        # Run OCR in a separate thread so it doesn't block async execution
        name, ic, address = await asyncio.to_thread(extract_ic_info, path)
    except Exception as e:
        name, ic, address = None, None, None
        print(f"OCR Error: {e}")
    finally:
        # Securely delete the image for privacy
        if os.path.exists(path):
            os.remove(path)
            
    await processing_msg.delete()
        
    if not ic:
        await update.message.reply_text("❌ Could not detect a valid IC number. The image might be blurry.\n\nPlease type your IC number manually (XXXXXX-XX-XXXX) or upload a clearer photo:")
        return IC_ENTRY
        
    # Store temporary OCR data
    context.user_data['ocr_name'] = name
    context.user_data['ocr_ic'] = ic
    context.user_data['ocr_address'] = address
    
    msg = (
        f"✅ *Extracted Info*\n"
        f"Name: {name}\n"
        f"IC: {ic}\n"
        f"Address: {address}\n\n"
        f"Is this correct?"
    )
    btns = [[InlineKeyboardButton("Yes, this is correct", callback_data="ocr_yes")],
            [InlineKeyboardButton("No, re-enter manually", callback_data="ocr_no")]]
    
    await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(btns), parse_mode="Markdown")
    return CONFIRM_OCR

async def confirm_ocr_logic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data == "ocr_no":
        await query.edit_message_text("No problem. Please enter your IC Number manually (Format: XXXXXX-XX-XXXX):")
        return IC_ENTRY
        
    await query.edit_message_text("✅ IC Information confirmed.")
    
    # Move OCR data into main data pool
    ic = context.user_data['ocr_ic']
    context.user_data['ic'] = ic
    context.user_data['name'] = context.user_data['ocr_name']
    context.user_data['address'] = context.user_data['ocr_address']
    
    # Check if this IC already exists in the Database
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{API_BASE}/patient/ic/{ic}")
        if res.status_code == 200:
            patient = res.json()
            # It's an existing patient, update session memory
            context.user_data['phone'] = patient['phone']
            return await proceed_to_service(update, context)
            
    # If it's a new patient, we already have their Name from the OCR, so skip REG_NAME!
    await query.message.reply_text(f"Welcome {context.user_data['name']}! Please enter your Phone Number:")
    return REG_PHONE

async def reg_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['name'] = update.message.text
    await update.message.reply_text("Please enter your Phone Number:")
    return REG_PHONE

async def reg_finish(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['phone'] = update.message.text
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
        
        if update.callback_query: 
            await update.callback_query.message.reply_text(msg, reply_markup=markup)
        else: 
            await update.message.reply_text(msg, reply_markup=markup)
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
        await query.message.reply_text("Please enter your preferred Date & Time (YYYY-MM-DD HH:MM):")
        return BOOK_TIME

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
    
    await query.message.reply_text("Please enter your preferred Date & Time (Format: YYYY-MM-DD HH:MM):")
    return BOOK_TIME

async def handle_time(update: Update, context: ContextTypes.DEFAULT_TYPE):
    time_str = update.message.text
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{API_BASE}/check-availability", params={"requested_time": time_str})
        data = res.json()
    
    if not data['is_valid']:
        sug_str = "\nSuggestions: " + ", ".join(data['suggestions']) if data['suggestions'] else ""
        await update.message.reply_text(f"❌ {data['reason']}{sug_str}\nPlease enter your preferred Date & Time again (Format: YYYY-MM-DD HH:MM):")
        return BOOK_TIME

    context.user_data['book_time'] = time_str
    
    name = context.user_data['name']
    ic = context.user_data['ic']
    phone = context.user_data['phone']
    date_part, time_part = time_str.split(" ")
    service = context.user_data['service']
    
    if service == 'Vaccine':
        details = f"{context.user_data['selected_items'][0]} ({context.user_data['dose']})"
    else:
        details = ", ".join(context.user_data['selected_items'])

    summary = (
        f"📋 *Booking Summary*\n"
        f"Name: {name}\n"
        f"IC: {ic}\n"
        f"Phone: {phone}\n"
        f"Date: {date_part}\n"
        f"Time: {time_part}\n"
        f"Service: {service}\n"
        f"Details: {details}\n\n"
        f"Is this information correct?"
    )
    
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
        # Includes the newly extracted 'address' payload dynamically 
        await client.post(f"{API_BASE}/register-patient", json={
            "name": context.user_data['name'], 
            "ic_number": context.user_data['ic'],
            "phone": context.user_data['phone'], 
            "telegram_id": update.effective_user.id,
            "address": context.user_data.get('address') # Safely passes Address if present
        })
        
        await client.post(f"{API_BASE}/book-appointment", json={
            "telegram_id": update.effective_user.id,
            "ic_number": context.user_data['ic'], 
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

    confirmed_summary = (
        f"✅ *Booking Successfully Confirmed!*\n\n"
        f"📋 *Confirmed Booking Summary*\n"
        f"Name: {context.user_data['name']}\n"
        f"IC: {context.user_data['ic']}\n"
        f"Phone: {context.user_data['phone']}\n"
        f"Date: {date_part}\n"
        f"Time: {time_part}\n"
        f"Service: {service}\n"
        f"Details: {details}\n"
    )
    
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
            # Accept both TEXT (manual entry) and PHOTO (OCR extraction)
            IC_ENTRY: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, ic_check),
                MessageHandler(filters.PHOTO, handle_ic_photo)
            ],
            CONFIRM_OCR: [CallbackQueryHandler(confirm_ocr_logic, pattern="^ocr_")],
            REG_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, reg_name)],
            REG_PHONE: [MessageHandler(filters.TEXT & ~filters.COMMAND, reg_finish)],
            V_SELECT: [CallbackQueryHandler(vaccine_selected, pattern="^v_")],
            V_DOSE: [CallbackQueryHandler(vaccine_dose, pattern="^dose_")],
            BT_FLOW: [CallbackQueryHandler(bt_logic)],
            BOOK_TIME: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_time)],
            CONFIRM_BOOK: [CallbackQueryHandler(process_confirmation, pattern="^conf_")],
            FINAL_HELP: [CallbackQueryHandler(final_help_logic, pattern="^help_")],
        },
        fallbacks=[CommandHandler('start', start)],
    )
    app.add_handler(conv)
    app.run_polling()