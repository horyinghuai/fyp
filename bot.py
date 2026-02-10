import os
import asyncio
import httpx # Async HTTP client to talk to FastAPI
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes, CallbackQueryHandler

# 1. Load environment variables
load_dotenv()

# 2. Retrieve the token securely
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

if not TOKEN:
    raise ValueError("No TELEGRAM_BOT_TOKEN found in .env file")

# --- Command Handlers ---

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Sends the welcome menu when the command /start is issued."""
    keyboard = [
        [InlineKeyboardButton("Book Appointment (Test AI Agent)", callback_data='book')],
        [InlineKeyboardButton("My Follow-ups", callback_data='status')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        'Welcome to the AI Clinic Assistant.\n'
        'I am connected to the backend system.\n'
        'Please choose an option:', 
        reply_markup=reply_markup
    )

# --- Button Callback Handlers ---

async def handle_booking(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Handles the 'Book Appointment' button click.
    Sends a hardcoded 'Dose 2' request to FastAPI to test the AI Agent logic.
    """
    query = update.callback_query
    await query.answer() # Acknowledge the click so the loading animation stops
    
    await query.edit_message_text(text="Consulting AI Agent for appointment slot...")

    # Define the test payload (Simulating a user asking for Dose 2)
    # This matches the heuristic rule we set in agent.py
    params = {
        "appt_type": "Vaccination Dose 2",
        "requested_time": "2026-02-15 09:00",
        "prev_status": "pending" # This triggers the rejection rule!
    }

    # Call FastAPI
    async with httpx.AsyncClient() as client:
        try:
            # Note: We use 127.0.0.1 for localhost communication
            response = await client.post("http://127.0.0.1:8000/book-appointment", params=params)
            
            if response.status_code == 200:
                data = response.json()
                await context.bot.send_message(
                    chat_id=query.message.chat_id,
                    text=f"✅ Success: {data['message']}"
                )
            else:
                # If the AI Agent rejects it (400 Bad Request)
                error_data = response.json()
                reason = error_data.get('detail', 'Unknown error')
                await context.bot.send_message(
                    chat_id=query.message.chat_id,
                    text=f"❌ Booking Failed: {reason}"
                )
                
        except httpx.RequestError as e:
            await context.bot.send_message(
                chat_id=query.message.chat_id,
                text=f"⚠️ System Error: Could not connect to Clinic Server.\n{e}"
            )

async def handle_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handles the 'My Follow-ups' button click."""
    query = update.callback_query
    await query.answer()
    await query.edit_message_text(text="Fetching your records from PostgreSQL...")
    
    # Placeholder: In the future, you can add a GET request to /appointments here
    await context.bot.send_message(
        chat_id=query.message.chat_id,
        text="ℹ️ You have no pending follow-ups found in the database."
    )

# --- Main Application ---

if __name__ == '__main__':
    # Build the application
    app = ApplicationBuilder().token(TOKEN).build()
    
    # Register Command Handlers
    app.add_handler(CommandHandler("start", start))
    
    # Register Button Handlers
    # The 'pattern' regex must match the 'callback_data' in the keyboard above
    app.add_handler(CallbackQueryHandler(handle_booking, pattern='^book$'))
    app.add_handler(CallbackQueryHandler(handle_status, pattern='^status$'))
    
    print("Bot is running and listening for commands...")
    app.run_polling()