"""add spindle_number to simplex bobbins and ringframe cops

Revision ID: 011
Revises: 010
Create Date: 2026-04-18
"""
from alembic import op
import sqlalchemy as sa


revision = '011'
down_revision = '010'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    simplex_cols = {c["name"] for c in inspector.get_columns("lab_simplex_bobbins")}
    if "spindle_number" not in simplex_cols:
        op.add_column(
            "lab_simplex_bobbins",
            sa.Column("spindle_number", sa.Integer(), nullable=True),
        )

    ringframe_cols = {c["name"] for c in inspector.get_columns("lab_ringframe_cops")}
    if "spindle_number" not in ringframe_cols:
        op.add_column(
            "lab_ringframe_cops",
            sa.Column("spindle_number", sa.Integer(), nullable=True),
        )


def downgrade():
    op.drop_column("lab_simplex_bobbins", "spindle_number")
    op.drop_column("lab_ringframe_cops", "spindle_number")
