"""add machine_number to lab_simplex_bobbins

Revision ID: 010
Revises: 009
Create Date: 2026-04-16
"""
from alembic import op
import sqlalchemy as sa


revision = '010'
down_revision = '009'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    existing_cols = {c["name"] for c in inspector.get_columns("lab_simplex_bobbins")}
    if "machine_number" not in existing_cols:
        op.add_column(
            "lab_simplex_bobbins",
            sa.Column("machine_number", sa.Integer(), nullable=True),
        )


def downgrade():
    op.drop_column("lab_simplex_bobbins", "machine_number")
