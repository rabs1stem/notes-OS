import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////app/data/notes.db")

if os.path.exists("/app/data"):
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "sqlite:////app/data/notes.db"
    )
else:
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "sqlite:///./notes.db"
    )

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


def get_db():

    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()
