"""add readings columns to lab_rsb_cans

Revision ID: 006
Revises: 005
Create Date: 2026-04-12 06:22:41
"""

from alembic import op
import sqlalchemy as sa


revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('lab_rsb_cans') as batch:
        batch.add_column(sa.Column('readings_json', sa.Text(), nullable=True))
        batch.add_column(sa.Column('readings_count', sa.Integer(), nullable=False, server_default='0'))
        batch.add_column(sa.Column('mean_hank', sa.Float(), nullable=True))
        batch.add_column(sa.Column('cv_pct', sa.Float(), nullable=True))


def downgrade():
    with op.batch_alter_table('lab_rsb_cans') as batch:
        batch.drop_column('cv_pct')
        batch.drop_column('mean_hank')
        batch.drop_column('readings_count')
        batch.drop_column('readings_json')
