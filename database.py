import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import sys

load_dotenv()

# Supabase provides a single standard connection string via DATABASE_URL
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    DB_USER = os.getenv("DB_USER")
    DB_PASSWORD = os.getenv("DB_PASSWORD")
    DB_HOST = os.getenv("DB_HOST")
    DB_PORT = os.getenv("DB_PORT")
    DB_NAME = os.getenv("DB_NAME")
    
    if DB_USER and DB_PASSWORD and DB_HOST:
        SQLALCHEMY_DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    else:
        print("CRITICAL ERROR: DATABASE_URL is not set in your .env file.")
        print("Please create a .env file and add your Supabase connection string.")
        sys.exit(1) # Stop the server gracefully with a clear error message
else:
    # SQLAlchemy requires 'postgresql://', some PaaS URLs use 'postgres://'
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_DATABASE_URL = DATABASE_URL

# Supabase requires SSL for remote connections
connect_args = {}
if "supabase" in SQLALCHEMY_DATABASE_URL.lower():
    connect_args = {"sslmode": "require"}

try:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_pre_ping=True, # Verifies connection before using it
        pool_size=5, 
        max_overflow=10,
        connect_args=connect_args
    )
    # Test the connection immediately on startup
    with engine.connect() as conn:
        pass
except Exception as e:
    print(f"CRITICAL ERROR: Could not connect to the database. Check your DATABASE_URL.")
    print(f"Details: {e}")
    sys.exit(1)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Use this single Base for all models
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()