"""add per-link reading columns to lab_simplex_inputs

Revision ID: 012
Revises: 011
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa


revision = '012'
down_revision = '011'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    cols = {c["name"] for c in inspector.get_columns("lab_simplex_inputs")}

    if "sample_length" not in cols:
        op.add_column(
            "lab_simplex_inputs",
            sa.Column("sample_length", sa.Float(), nullable=True),
        )
    if "readings_json" not in cols:
        op.add_column(
            "lab_simplex_inputs",
            sa.Column("readings_json", sa.Text(), nullable=True),
        )
    if "readings_count" not in cols:
        op.add_column(
            "lab_simplex_inputs",
            sa.Column("readings_count", sa.Integer(), nullable=True),
        )
    if "mean_hank" not in cols:
        op.add_column(
            "lab_simplex_inputs",
            sa.Column("mean_hank", sa.Float(), nullable=True),
        )
    if "cv_pct" not in cols:
        op.add_column(
            "lab_simplex_inputs",
            sa.Column("cv_pct", sa.Float(), nullable=True),
        )


def downgrade():
    op.drop_column("lab_simplex_inputs", "cv_pct")
    op.drop_column("lab_simplex_inputs", "mean_hank")
    op.drop_column("lab_simplex_inputs", "readings_count")
    op.drop_column("lab_simplex_inputs", "readings_json")
    op.drop_column("lab_simplex_inputs", "sample_length")
