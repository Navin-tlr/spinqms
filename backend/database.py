"""
database.py — SQLAlchemy engine + session factory
==================================================
Connection priority:
  1. DATABASE_URL env var  — set in Render dashboard
  2. ./qms.db              — local SQLite fallback (dev only)

Supabase Transaction Pooler (port 6543 / Supavisor):
  Use the "Transaction mode" connection string from Supabase dashboard.
  Format: postgresql://postgres.[ref]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
  NullPool is used for this connection type — Supavisor manages pooling
  externally, so SQLAlchemy should not hold connections open between requests.

Direct connection (port 5432):
  Used for Alembic migrations (run separately, not via Supavisor).
  SQLAlchemy's default pool is fine here.
"""

import os
from urllib.parse import urlparse

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import NullPool

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./qms.db")

# Render / older Heroku-style prefix fix
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

_is_sqlite = DATABASE_URL.startswith("sqlite")

# Detect Supabase Transaction Pooler (port 6543) — use NullPool so
# Supavisor handles all connection management instead of SQLAlchemy's pool.
_parsed = urlparse(DATABASE_URL) if not _is_sqlite else None
_use_nullpool = _parsed is not None and _parsed.port == 6543

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    pool_pre_ping=True,
    poolclass=NullPool if _use_nullpool else None,
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
