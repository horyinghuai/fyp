import os
import httpx
import re
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, CommandHandler, ContextTypes, 
    CallbackQueryHandler, ConversationHandler, MessageHandler, filters
)

load_dotenv()
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
API_BASE = "http://127.0.0.1:8000"

# States
SERVICE, IC_ENTRY, REG_NAME, REG_PHONE, V_SELECT, V_QTY, BT_FLOW, BOOK_TIME = range(8)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    btns = [[InlineKeyboardButton("Vaccines", callback_data="svc_Vaccine")],
            [InlineKeyboardButton("Blood Tests", callback_data="svc_Blood Test")],
            [InlineKeyboardButton("Others", callback_data="svc_Others")]]
    await update.message.reply_text("Welcome to the AI Clinic! What service do you need today?", reply_markup=InlineKeyboardMarkup(btns))
    return SERVICE

async def service_choice(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    context.user_data['service'] = query.data.replace("svc_", "")
    await query.message.reply_text("Please enter your IC Number (Format: XXXXXX-XX-XXXX):")
    return IC_ENTRY

async def ic_check(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ic = update.message.text
    if not re.match(r"^\d{6}-\d{2}-\d{4}$", ic):
        await update.message.reply_text("❌ Wrong format! Please insert the IC number again (XXXXXX-XX-XXXX):")
        return IC_ENTRY
    
    context.user_data['ic'] = ic
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{API_BASE}/patient/ic/{ic}")
        if res.status_code == 200:
            return await proceed_to_service(update, context)
        
    await update.message.reply_text("New user detected. Please enter your Full Name:")
    return REG_NAME

async def reg_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['name'] = update.message.text
    await update.message.reply_text("Please enter your Phone Number:")
    return REG_PHONE

async def reg_finish(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['phone'] = update.message.text
    async with httpx.AsyncClient() as client:
        await client.post(f"{API_BASE}/register-patient", json={
            "name": context.user_data['name'], "ic_number": context.user_data['ic'],
            "phone": context.user_data['phone'], "telegram_id": update.effective_user.id
        })
    return await proceed_to_service(update, context)

async def proceed_to_service(update, context):
    service = context.user_data['service']
    context.user_data['selected_items'] = []
    async with httpx.AsyncClient() as client:
        if service == 'Vaccine':
            res = await client.get(f"{API_BASE}/vaccines")
            btns = [[InlineKeyboardButton(f"{v['name']} (RM{v['price']})", callback_data=f"v_{v['name']}")] for v in res.json()]
            await (update.message.reply_text if update.message else update.callback_query.message.reply_text)("Choose a vaccine:", reply_markup=InlineKeyboardMarkup(btns))
            return V_SELECT
        else:
            return await show_blood_tests(update, context, "package")

async def show_blood_tests(update, context, t_type):
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{API_BASE}/blood-tests/{t_type}")
        tests = res.json()
        selected = context.user_data.get('selected_items', [])
        btns = [[InlineKeyboardButton(f"{t['name']} (RM{t['price']})", callback_data=f"sel_{t['name']}")] for t in tests if t['name'] not in selected]
        if t_type == "package": btns.append([InlineKeyboardButton("OTHERS (Single Tests)", callback_data="bt_others")])
        
        msg = "Choose a package:" if t_type == "package" else "Choose a single test:"
        markup = InlineKeyboardMarkup(btns)
        if update.callback_query: await update.callback_query.edit_message_text(msg, reply_markup=markup)
        else: await update.message.reply_text(msg, reply_markup=markup)
        return BT_FLOW

async def bt_logic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data

    if data == "bt_others": return await show_blood_tests(update, context, "single")
    
    if data.startswith("sel_"):
        item = data.replace("sel_", "")
        context.user_data['selected_items'].append(item)
        btns = [[InlineKeyboardButton("Yes, add extra", callback_data="add_more"), InlineKeyboardButton("No thanks, finish", callback_data="add_done")]]
        await query.edit_message_text(f"Added: {item}. Would you like to add more tests?", reply_markup=InlineKeyboardMarkup(btns))
        return BT_FLOW

    if data == "add_more": return await show_blood_tests(update, context, "single")
    if data == "add_done":
        await query.edit_message_text("Please enter your preferred Date & Time (YYYY-MM-DD HH:MM):")
        return BOOK_TIME

# --- Vaccine Logic ---
async def vaccine_selected(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    context.user_data['selected_items'] = [query.data.replace("v_", "")]
    await query.edit_message_text(f"Selected: {context.user_data['selected_items'][0]}. How many people are coming?")
    return V_QTY

async def vaccine_qty(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['qty'] = update.message.text
    await update.message.reply_text("Please enter your preferred Date & Time (YYYY-MM-DD HH:MM):")
    return BOOK_TIME

async def handle_time(update: Update, context: ContextTypes.DEFAULT_TYPE):
    time_str = update.message.text
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{API_BASE}/check-availability", params={"requested_time": time_str})
        data = res.json()
    
    if not data['is_valid']:
        sug_str = "\nSuggestions: " + ", ".join(data['suggestions']) if data['suggestions'] else ""
        await update.message.reply_text(f"❌ {data['reason']}{sug_str}\nPlease choose another slot:")
        return BOOK_TIME

    context.user_data['book_time'] = time_str
    async with httpx.AsyncClient() as client:
        await client.post(f"{API_BASE}/book-appointment", json={
            "telegram_id": update.effective_user.id,
            "service_type": context.user_data['service'],
            "details": {"items": context.user_data['selected_items'], "qty": context.user_data.get('qty', 1)},
            "scheduled_time": time_str
        })
    
    summary = f"✅ Booking Confirmed!\nDate/Time: {time_str}\nService: {context.user_data['service']}\nDetails: {', '.join(context.user_data['selected_items'])}"
    await update.message.reply_text(summary)
    return ConversationHandler.END

if __name__ == '__main__':
    app = ApplicationBuilder().token(TOKEN).build()
    conv = ConversationHandler(
        entry_points=[CommandHandler('start', start)],
        states={
            SERVICE: [CallbackQueryHandler(service_choice, pattern="^svc_")],
            IC_ENTRY: [MessageHandler(filters.TEXT & ~filters.COMMAND, ic_check)],
            REG_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, reg_name)],
            REG_PHONE: [MessageHandler(filters.TEXT & ~filters.COMMAND, reg_finish)],
            V_SELECT: [CallbackQueryHandler(vaccine_selected, pattern="^v_")],
            V_QTY: [MessageHandler(filters.TEXT & ~filters.COMMAND, vaccine_qty)],
            BT_FLOW: [CallbackQueryHandler(bt_logic)],
            BOOK_TIME: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_time)],
        },
        fallbacks=[CommandHandler('start', start)],
    )
    app.add_handler(conv)
    print("Bot is running...")
    app.run_polling()