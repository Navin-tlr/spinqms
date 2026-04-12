
"""add sample_length to simplex/ringflow

Revision ID: 008
Revises: 007
Create Date: 2026-04-12 07:24:00
"""

from alembic import op
import sqlalchemy as sa


revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('lab_simplex_bobbins') as batch:
        batch.add_column(sa.Column('sample_length', sa.Float(), nullable=False, server_default='6.0'))
    with op.batch_alter_table('lab_ringframe_cops') as batch:
        batch.add_column(sa.Column('sample_length', sa.Float(), nullable=False, server_default='120.0'))
    op.execute("UPDATE lab_simplex_bobbins SET sample_length = 6.0 WHERE sample_length IS NULL")
    op.execute("UPDATE lab_ringframe_cops SET sample_length = 120.0 WHERE sample_length IS NULL")


def downgrade():
    with op.batch_alter_table('lab_ringframe_cops') as batch:
        batch.drop_column('sample_length')
    with op.batch_alter_table('lab_simplex_bobbins') as batch:
        batch.drop_column('sample_length')
