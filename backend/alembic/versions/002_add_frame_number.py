"""Add frame_number column to samples table.

Ring Frame department uses frame_number (1–25) to track which
physical frame produced each batch.

Revision ID: 002
Revises: 001
Create Date: 2026-04-09
"""

from __future__ import annotations
from typing import Union

from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: str = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = {c["name"] for c in inspector.get_columns("samples")}
    if "frame_number" not in cols:
        op.add_column("samples", sa.Column("frame_number", sa.Integer, nullable=True))


def downgrade() -> None:
    op.drop_column("samples", "frame_number")
