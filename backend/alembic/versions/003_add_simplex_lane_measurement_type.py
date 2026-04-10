"""add simplex_lane and measurement_type to samples

Revision ID: 003
Revises: 002
Create Date: 2026-04-10
"""
from alembic import op
import sqlalchemy as sa


revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('samples')]

    if 'simplex_lane' not in columns:
        op.add_column('samples', sa.Column('simplex_lane', sa.String(), nullable=True))
    if 'measurement_type' not in columns:
        op.add_column('samples', sa.Column('measurement_type', sa.String(), nullable=True))


def downgrade():
    op.drop_column('samples', 'measurement_type')
    op.drop_column('samples', 'simplex_lane')
