"""add frame_number to lab_ringframe_cops

Revision ID: 009
Revises: 008
Create Date: 2026-04-14
"""

from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = {c["name"] for c in inspector.get_columns("lab_ringframe_cops")}
    if "frame_number" in cols:
        return
    with op.batch_alter_table("lab_ringframe_cops") as batch:
        batch.add_column(sa.Column("frame_number", sa.Integer(), nullable=True))


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    cols = {c["name"] for c in inspector.get_columns("lab_ringframe_cops")}
    if "frame_number" not in cols:
        return
    with op.batch_alter_table("lab_ringframe_cops") as batch:
        batch.drop_column("frame_number")

