"""
database.py — SQLAlchemy engine + session factory
==================================================
Connection priority:
  1. DATABASE_URL env var  — set this in Render / Neon / Supabase
  2. ./qms.db              — local SQLite fallback (dev only)

SQLite extras (WAL mode, FK enforcement) are applied only when the
dialect is SQLite — they are invalid syntax on PostgreSQL.
"""

import os
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./qms.db")

# Render / Heroku historically prefix postgres:// — SQLAlchemy needs postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

_is_sqlite = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    # SQLite needs check_same_thread=False; harmless to omit for Postgres
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    pool_pre_ping=True,
)


@event.listens_for(engine, "connect")
def _on_connect(dbapi_conn, _record):
    """SQLite-only: enable WAL journal mode and foreign-key enforcement."""
    if not _is_sqlite:
        return
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
