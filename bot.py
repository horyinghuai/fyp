import os
import httpx
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, CommandHandler, ContextTypes, 
    CallbackQueryHandler, ConversationHandler, MessageHandler, filters
)

load_dotenv()
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
API_BASE = "http://127.0.0.1:8000"

# Conversation states
NAME, IC_NUMBER, PHONE, RESCHEDULE_TIME = range(4)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("📝 Register / Update Info", callback_data='reg_start')],
        [InlineKeyboardButton("📅 Book Appointment", callback_data='book')],
        [InlineKeyboardButton("✏️ Modify Booking", callback_data='modify')],
        [InlineKeyboardButton("❌ Cancel Booking", callback_data='cancel')],
        [InlineKeyboardButton("📋 My Status", callback_data='status')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text('Welcome to the Clinic Assistant. Choose an option:', reply_markup=reply_markup)

# --- Registration Flow (Now includes IC) ---

async def reg_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    await query.edit_message_text("Please enter your Full Name:")
    return NAME

async def get_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['name'] = update.message.text
    await update.message.reply_text(f"Hi {update.message.text}, please enter your IC Number:")
    return IC_NUMBER

async def get_ic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['ic_number'] = update.message.text
    await update.message.reply_text("Great. Finally, please enter your Phone Number:")
    return PHONE

async def get_phone(update: Update, context: ContextTypes.DEFAULT_TYPE):
    phone = update.message.text
    name = context.user_data['name']
    ic = context.user_data['ic_number']
    tid = update.effective_user.id

    async with httpx.AsyncClient() as client:
        response = await client.post(f"{API_BASE}/register-patient", 
                                     json={"name": name, "ic_number": ic, "phone": phone, "telegram_id": tid})
    
    await update.message.reply_text(f"✅ Registration complete! Name: {name}, IC: {ic}")
    return ConversationHandler.END

# --- Booking & Modification Logic ---

async def handle_booking(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    tid = update.effective_user.id

    async with httpx.AsyncClient() as client:
        # Hardcoded booking for demo purposes
        params = {
            "appt_type": "Vaccination Dose 1",
            "requested_time": "2026-02-12 10:00",
            "telegram_id": tid
        }
        response = await client.post(f"{API_BASE}/book-appointment", params=params)
        
    res = response.json()
    msg = res.get("detail", res.get("message"))
    
    if response.status_code == 200:
        await query.edit_message_text(f"✅ {msg}")
    else:
        await query.edit_message_text(f"❌ {msg}")

async def start_modify(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    await query.edit_message_text("Please enter the new Date & Time (Format: YYYY-MM-DD HH:MM):")
    return RESCHEDULE_TIME

async def process_reschedule(update: Update, context: ContextTypes.DEFAULT_TYPE):
    new_time = update.message.text
    tid = update.effective_user.id
    
    await update.message.reply_text("Consulting AI Agent for availability...")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{API_BASE}/reschedule-appointment", 
            params={"telegram_id": tid, "new_time": new_time}
        )

    res = response.json()
    if response.status_code == 200:
        await update.message.reply_text(f"✅ Success: {res['message']}")
    else:
        # This displays the Agent's reason/suggestion
        reason = res.get('detail', 'Unknown error')
        await update.message.reply_text(f"⚠️ Agent Suggestion: {reason}")
    
    return ConversationHandler.END

async def handle_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    tid = update.effective_user.id
    
    await query.edit_message_text("Cancelling your appointment...")

    async with httpx.AsyncClient() as client:
        response = await client.delete(f"{API_BASE}/cancel-appointment", params={"telegram_id": tid})
    
    res = response.json()
    msg = res.get("detail", res.get("message"))
    await context.bot.send_message(chat_id=tid, text=f"🗑️ {msg}")

async def cancel_conversation(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Operation cancelled.")
    return ConversationHandler.END

if __name__ == '__main__':
    app = ApplicationBuilder().token(TOKEN).build()
    
    # Registration Handler
    reg_handler = ConversationHandler(
        entry_points=[CallbackQueryHandler(reg_start, pattern='reg_start'), CommandHandler('register', reg_start)],
        states={
            NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_name)],
            IC_NUMBER: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_ic)],
            PHONE: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_phone)],
        },
        fallbacks=[CommandHandler('cancel', cancel_conversation)],
    )

    # Modification Handler
    modify_handler = ConversationHandler(
        entry_points=[CallbackQueryHandler(start_modify, pattern='modify')],
        states={
            RESCHEDULE_TIME: [MessageHandler(filters.TEXT & ~filters.COMMAND, process_reschedule)],
        },
        fallbacks=[CommandHandler('cancel', cancel_conversation)],
    )

    app.add_handler(CommandHandler("start", start))
    app.add_handler(reg_handler)
    app.add_handler(modify_handler)
    app.add_handler(CallbackQueryHandler(handle_booking, pattern='^book$'))
    app.add_handler(CallbackQueryHandler(handle_cancel, pattern='^cancel$'))
    
    print("Bot is running...")
    app.run_polling()