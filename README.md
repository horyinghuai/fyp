# System Configuration and Hosting Guide

**Project Title:** AI Agent-Based Multi-Stage Appointment Scheduling System for Clinics  
**Prepared By:** Hor Ying Huai  
**Faculty:** Faculty of Artificial Intelligence and Cyber Security  
**University:** Universiti Teknikal Malaysia Melaka  

---

## 1. System Overview

The AI Agent-Based Multi-Stage Appointment Scheduling System for Clinics is developed using a multi-tier client-server architecture consisting of a React web application, FastAPI backend, PostgreSQL database, Telegram Bot, Redis message broker, Celery background worker, and AI services. The frontend communicates with the backend through REST APIs, while asynchronous background tasks are managed by Celery and Redis. PostgreSQL stores all persistent application data.

---

## 2. Software Configuration

| Component | Technology |
| :--- | :--- |
| **Operating System** | Windows 11 Pro (64-bit) |
| **Programming Language** | Python 3.x |
| **Backend Framework** | FastAPI |
| **API Server** | Uvicorn |
| **Frontend Framework** | React.js (Next.js) |
| **Database** | PostgreSQL |
| **ORM** | SQLAlchemy |
| **Background Task Queue** | Celery |
| **Message Broker** | Redis |
| **Telegram Framework** | python-telegram-bot |
| **AI Framework** | LangChain, LangGraph |
| **Local AI Model** | DeepSeek |
| **Cloud AI Model** | Google Gemini API |
| **OCR Library** | Google Cloud Vision API, EasyOCR |
| **Testing Framework** | Pytest |
| **Package Manager** | npm |

---

## 3. Hardware Configuration

| Hardware | Specification |
| :--- | :--- |
| **Processor** | Intel Core i5 / AMD Ryzen 5 or higher |
| **RAM** | Minimum 16 GB |
| **Storage** | Minimum 256 GB SSD |
| **Internet** | Broadband Internet Connection |

---

## 4. Hosting Configuration

### Backend Server

| Item | Value |
| :--- | :--- |
| **Framework** | FastAPI |
| **Entry File** | `main.py` |
| **Application** | `app` |
| **Host** | `localhost` |
| **Port** | `8000` |

**Startup Command:**

```bash
uvicorn main:app --reload
```

### Telegram Bot

| **Item** | **Value** |
| ------------------ | ------------------- |
| **Framework** | python-telegram-bot |
| **Entry File** | `bot.py` |
| **Execution Mode** | Long Polling |

**Startup Command:**

```bash
python bot.py
```

### Celery Worker

| **Item** | **Value** |
| --------------- | ------------------ |
| **Worker File** | `celery_worker.py` |
| **Pool** | solo |
| **Log Level** | info |

**Startup Command:**

```bash
celery -A celery_worker worker --pool=solo --loglevel=info
```

### Frontend Server

| **Item** | **Value** |
| ------------- | ------------------------------------ |
| **Framework** | React.js (Next.js) |
| **Directory** | `clinic-frontend` |
| **Host** | `localhost` |
| **Port** | `3000` (or default development port) |

**Startup Commands:**

```bash
cd clinic-frontend
npm run dev
```

### PostgreSQL Database

| **Item** | **Value** |
| ---------------- | ---------- |
| **Database** | PostgreSQL |
| **Default Port** | `5432` |
| **ORM** | SQLAlchemy |

*Note: The PostgreSQL server stores clinic, doctor, patient, appointment, vaccine, blood test, chatbot and AI log data.*

### Redis Server

| **Item** | **Value** |
| ------------------ | --------- |
| **Message Broker** | Redis |
| **Default Port** | `6379` |

*Note: Redis provides communication between the FastAPI backend and Celery worker for asynchronous task processing.*

---

## 5. Environment Variables

The application uses a `.env` file to store sensitive configuration values. API keys and passwords should never be hard-coded into the application source code.

**Example configuration:**

```env
TELEGRAM_BOT_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxx
GEMINI_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
LOCAL_LLM_BASE_URL=http://localhost:1234/v1
LOCAL_MODEL_NAME=deepseek/deepseek-r1-0528-qwen3-8b
SENDGRID_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=aicasclinicbot@gmail.com
GOOGLE_VISION_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_APPLICATION_CREDENTIALS=ocr.json
MOCEAN_API_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 6. Python Dependencies

Required Python packages include: `fastapi`, `uvicorn`, `sqlalchemy`, `psycopg2`, `python-dotenv`, `python-telegram-bot`, `langchain`, `langgraph`, `google-generativeai`, `easyocr`, `celery`, `redis`, `pytest`, `pytest-html`.

**Install using:**

```bash
pip install -r requirements.txt
```

---

## 7. Frontend Dependencies

The project dependencies are automatically installed from `package.json`.

**Required Node.js packages are installed using:**

```bash
cd clinic-frontend
npm install
```

---

## 8. System Startup Procedure

The services must be started in the following order.

1. **Start PostgreSQL Database Server.**
2. **Start Redis Server.**
3. **Start FastAPI Backend:**

   ```bash
   uvicorn main:app --reload
   ```

4. **Start Telegram Bot:**

   ```bash
   python bot.py
   ```

5. **Start Celery Worker:**

   ```bash
   celery -A celery_worker worker --pool=solo --loglevel=info
   ```

6. **Start React Frontend:**

   ```bash
   cd clinic-frontend
   npm run dev
   ```

7. **Access the system:**

   - **Frontend:** `http://localhost:3000`
   - **Backend API:** `http://localhost:8000`

---

## 9. System Testing

Execute automated testing using Pytest.

```bash
pytest -v --html=report.html
```

The generated testing report is stored as `report.html` in the root directory.

---

## 10. Deployment Notes

The system is designed using a modular architecture. Each service operates independently and communicates through REST APIs or asynchronous task queues. The frontend, backend, database, Telegram bot and Celery worker can be deployed on the same server or distributed across multiple servers depending on deployment requirements.

---

## 11. System Directory Structure

```text
Project Root/
│
├── .gitignore
├── agent.py
├── bot.py
├── celery_worker.py
├── conftest.py
├── database.py
├── main.py
├── models.py
├── pytest.ini
├── report.html
│
├── assets/
│   └── style.css
│
├── clinic-frontend/
│   ├── .gitignore
│   ├── AGENTS.md
│   ├── CLAUDE.md
│   ├── README.md
│   ├── eslint.config.mjs
│   ├── next.config.ts
│   ├── package-lock.json
│   ├── package.json
│   ├── postcss.config.mjs
│   ├── tsconfig.json
│   │
│   ├── app/
│   │   ├── favicon.ico
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── blood_test/
│   │   │   └── page.tsx
│   │   ├── bot_replies/
│   │   │   └── page.tsx
│   │   ├── developer/
│   │   │   └── page.tsx
│   │   ├── discovery/
│   │   │   └── page.tsx
│   │   ├── doctors/
│   │   │   └── page.tsx
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── patients/
│   │   │   └── page.tsx
│   │   ├── reports/
│   │   │   └── page.tsx
│   │   ├── settings/
│   │   │   └── page.tsx
│   │   ├── staff/
│   │   │   └── page.tsx
│   │   └── vaccines/
│   │       └── page.tsx
│   │
│   └── public/
│       ├── file.svg
│       ├── globe.svg
│       ├── next.svg
│       ├── vercel.svg
│       └── window.svg
│
└── tests/
    ├── __init__.py
    ├── fake_db.py
    ├── test_agent.py
    ├── test_ai_extraction_accuracy.py
    ├── test_booking_success_rate.py
    ├── test_monkey.py
    ├── test_scheduling_accuracy.py
    ├── test_scheduling_agent_evaluation.py
    ├── test_smoke.py
    └── test_vaccine_dependency_evaluation.py
```