import os
import httpx
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, CommandHandler, ContextTypes, 
    CallbackQueryHandler, ConversationHandler, MessageHandler, filters
)

load_dotenv()
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
API_BASE = "http://127.0.0.1:8000"

# --- Fixed States ---
SERVICE, IC_ENTRY, REG_NAME, REG_PHONE, V_SELECT, V_D1_QTY, V_D2_QTY, BT_SELECT, BT_ADDON = range(9)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    reply_keyboard = [['Vaccine', 'Blood Test', 'Others']]
    await update.message.reply_text(
        "Welcome to the AI Clinic! What service do you need today?",
        reply_markup=ReplyKeyboardMarkup(reply_keyboard, one_time_keyboard=True)
    )
    return SERVICE

async def service_choice(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['service'] = update.message.text
    await update.message.reply_text("Please enter your IC Number (XXXXXX-XX-XXXX):")
    return IC_ENTRY

async def ic_check(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ic = update.message.text
    context.user_data['ic'] = ic
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(f"{API_BASE}/patient/ic/{ic}")
            if res.status_code == 200:
                return await proceed_to_service(update, context)
        except Exception:
            await update.message.reply_text("⚠️ Server connection failed.")
            return ConversationHandler.END
            
    await update.message.reply_text("IC not found. Please enter your Full Name to register:")
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

async def proceed_to_service(update: Update, context: ContextTypes.DEFAULT_TYPE):
    service = context.user_data['service']
    async with httpx.AsyncClient() as client:
        if service == 'Vaccine':
            res = await client.get(f"{API_BASE}/vaccines")
            btns = [[InlineKeyboardButton(f"{v['name']} (RM{v['price']})", callback_data=f"v_{v['name']}")] for v in res.json()]
            await (update.message.reply_text if update.message else update.callback_query.message.reply_text)(
                "Choose a vaccine:", reply_markup=InlineKeyboardMarkup(btns))
            return V_SELECT
        else:
            test_type = 'package' if service == 'Blood Test' else 'single'
            res = await client.get(f"{API_BASE}/blood-tests/{test_type}")
            btns = [[InlineKeyboardButton(f"{t['name']} (RM{t['price']})", callback_data=f"bt_{t['name']}")] for t in res.json()]
            if service == 'Blood Test': btns.append([InlineKeyboardButton("OTHERS (Single Tests)", callback_data="bt_others")])
            await (update.message.reply_text if update.message else update.callback_query.message.reply_text)(
                "Select a package or test:", reply_markup=InlineKeyboardMarkup(btns))
            return BT_SELECT

# --- Vaccine Quantity Flow ---
async def vaccine_selected(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    if query: await query.answer()
    context.user_data['v_name'] = query.data.replace("v_", "")
    await query.edit_message_text(f"Selected: {context.user_data['v_name']}. How many people need Dose 1?")
    return V_D1_QTY

async def v_d1_qty(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['d1'] = int(update.message.text)
    await update.message.reply_text("How many people need Dose 2?")
    return V_D2_QTY

async def v_d2_qty(update: Update, context: ContextTypes.DEFAULT_TYPE):
    d2 = int(update.message.text)
    total = context.user_data['d1'] + d2
    async with httpx.AsyncClient() as client:
        res = await client.post(f"{API_BASE}/book-appointment", json={
            "telegram_id": update.effective_user.id, "service_type": "Vaccine",
            "details": {"vaccine_name": context.user_data['v_name'], "dose1": context.user_data['d1'], "dose2": d2, "total_qty": total}
        })
    if res.status_code == 200:
        await update.message.reply_text(f"✅ Confirmed: {context.user_data['v_name']} for {total} pax.")
    else:
        await update.message.reply_text(f"❌ {res.json()['detail']}")
    return ConversationHandler.END

# --- Blood Test / Others Flow ---
async def bt_selected(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    if query: await query.answer()
    context.user_data['bt_main'] = query.data.replace("bt_", "")
    
    if context.user_data['bt_main'] == "others":
        context.user_data['service'] = "Others" # Shift logic
        return await proceed_to_service(update, context)

    btns = [[InlineKeyboardButton("Add Single Test", callback_data="add_yes"), InlineKeyboardButton("No, Finish", callback_data="add_no")]]
    await query.edit_message_text(f"Selected: {context.user_data['bt_main']}. Add single tests?", reply_markup=InlineKeyboardMarkup(btns))
    return BT_ADDON

async def bt_addon_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    if query: await query.answer()
    if query.data == "add_no":
        async with httpx.AsyncClient() as client:
            await client.post(f"{API_BASE}/book-appointment", json={
                "telegram_id": query.from_user.id, "service_type": "Blood Test",
                "details": {"package": context.user_data['bt_main']}
            })
        await query.edit_message_text("✅ Booking confirmed.")
        return ConversationHandler.END
    # Logic for add-ons can be expanded here
    return BT_ADDON

if __name__ == '__main__':
    app = ApplicationBuilder().token(TOKEN).build()
    conv = ConversationHandler(
        entry_points=[CommandHandler('start', start)],
        states={
            SERVICE: [MessageHandler(filters.TEXT & ~filters.COMMAND, service_choice)],
            IC_ENTRY: [MessageHandler(filters.TEXT & ~filters.COMMAND, ic_check)],
            REG_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, reg_name)],
            REG_PHONE: [MessageHandler(filters.TEXT & ~filters.COMMAND, reg_finish)],
            V_SELECT: [CallbackQueryHandler(vaccine_selected)],
            V_D1_QTY: [MessageHandler(filters.TEXT & ~filters.COMMAND, v_d1_qty)],
            V_D2_QTY: [MessageHandler(filters.TEXT & ~filters.COMMAND, v_d2_qty)],
            BT_SELECT: [CallbackQueryHandler(bt_selected)],
            BT_ADDON: [CallbackQueryHandler(bt_addon_handler)],
        },
        fallbacks=[CommandHandler('start', start)],
    )
    app.add_handler(conv)
    app.add_handler(CommandHandler('cancel', lambda u, c: ConversationHandler.END))
    print("Bot is running...")
    app.run_polling()