import os
import asyncio
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

# 1. Load environment variables
load_dotenv()

# 2. Retrieve the token securely
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

if not TOKEN:
    raise ValueError("No TELEGRAM_BOT_TOKEN found in .env file")

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Define the menu buttons
    keyboard = [
        [InlineKeyboardButton("Book Appointment", callback_data='book')],
        [InlineKeyboardButton("My Follow-ups", callback_data='status')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    # Send the welcome message with the menu
    await update.message.reply_text(
        'Welcome to the Clinic Assistant. Please choose an option:', 
        reply_markup=reply_markup
    )

if __name__ == '__main__':
    # 3. Use the loaded token to build the application
    app = ApplicationBuilder().token(TOKEN).build()
    
    # Add handlers
    app.add_handler(CommandHandler("start", start))
    
    print("Bot is running...")
    app.run_polling()