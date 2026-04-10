"""
database.py — SQLAlchemy engine + session factory
==================================================
SQLite with WAL journal mode for concurrent read performance.

Production path resolution:
  1. DATABASE_URL env var (full SQLAlchemy URL, e.g. sqlite:////data/qms.db)
  2. /data/qms.db  — Render persistent disk mount point
  3. ./qms.db      — local development fallback
"""

import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# Priority: DATABASE_URL env → /data (Render persistent disk) → local dev
_DB_URL = (
    os.environ.get("DATABASE_URL")
    or (
        "sqlite:////data/qms.db"
        if os.path.isdir("/data")
        else "sqlite:///./qms.db"
    )
)

engine = create_engine(
    _DB_URL,
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _connection_record):
    """Enable WAL mode and foreign-key enforcement on every new connection."""
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
