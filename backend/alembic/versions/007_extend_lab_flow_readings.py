
"""extend YarnLAB flow entities with readings metadata

Revision ID: 007
Revises: 006
Create Date: 2026-04-12 06:37:15
"""

from alembic import op
import sqlalchemy as sa


revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('lab_rsb_cans') as batch:
        batch.add_column(sa.Column('sample_length', sa.Float(), nullable=False, server_default='6.0'))

    with op.batch_alter_table('lab_simplex_bobbins') as batch:
        batch.add_column(sa.Column('readings_json', sa.Text(), nullable=True))
        batch.add_column(sa.Column('readings_count', sa.Integer(), nullable=False, server_default='0'))
        batch.add_column(sa.Column('mean_hank', sa.Float(), nullable=True))
        batch.add_column(sa.Column('cv_pct', sa.Float(), nullable=True))

    with op.batch_alter_table('lab_ringframe_cops') as batch:
        batch.add_column(sa.Column('readings_json', sa.Text(), nullable=True))
        batch.add_column(sa.Column('readings_count', sa.Integer(), nullable=False, server_default='0'))
        batch.add_column(sa.Column('mean_hank', sa.Float(), nullable=True))
        batch.add_column(sa.Column('cv_pct', sa.Float(), nullable=True))

    op.execute("UPDATE lab_rsb_cans SET sample_length = 6.0 WHERE sample_length IS NULL")


def downgrade():
    with op.batch_alter_table('lab_ringframe_cops') as batch:
        batch.drop_column('cv_pct')
        batch.drop_column('mean_hank')
        batch.drop_column('readings_count')
        batch.drop_column('readings_json')

    with op.batch_alter_table('lab_simplex_bobbins') as batch:
        batch.drop_column('cv_pct')
        batch.drop_column('mean_hank')
        batch.drop_column('readings_count')
        batch.drop_column('readings_json')

    with op.batch_alter_table('lab_rsb_cans') as batch:
        batch.drop_column('sample_length')
