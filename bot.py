from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("Book Appointment", callback_data='book')],
        [InlineKeyboardButton("My Follow-ups", callback_data='status')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text('Welcome to the Clinic Assistant. Please choose:', reply_markup=reply_markup)

if __name__ == '__main__':
    app = ApplicationBuilder().token("YOUR_TELEGRAM_TOKEN").build()
    app.add_handler(CommandHandler("start", start))
    app.run_polling()