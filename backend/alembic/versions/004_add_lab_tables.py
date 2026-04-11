"""add YarnLAB tables: lab_trials, lab_benchmarks, lab_samples

Revision ID: 004
Revises: 003
Create Date: 2026-04-10
"""
from alembic import op
import sqlalchemy as sa


revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'lab_trials' not in existing_tables:
        op.create_table(
            'lab_trials',
            sa.Column('id',          sa.Integer(),  primary_key=True),
            sa.Column('name',        sa.String(),   nullable=False),
            sa.Column('description', sa.String(),   nullable=True),
            sa.Column('status',      sa.String(),   nullable=False, server_default='active'),
            sa.Column('created_at',  sa.DateTime(), nullable=False),
        )

    if 'lab_benchmarks' not in existing_tables:
        op.create_table(
            'lab_benchmarks',
            sa.Column('id',        sa.Integer(), primary_key=True),
            sa.Column('trial_id',  sa.Integer(), sa.ForeignKey('lab_trials.id', ondelete='CASCADE'),
                      nullable=False, index=True),
            sa.Column('dept_id',   sa.String(),  nullable=False),
            sa.Column('target',    sa.Float(),   nullable=False),
            sa.Column('tolerance', sa.Float(),   nullable=False),
            sa.UniqueConstraint('trial_id', 'dept_id', name='uq_lab_bench'),
        )

    if 'lab_samples' not in existing_tables:
        op.create_table(
            'lab_samples',
            sa.Column('id',             sa.Integer(), primary_key=True),
            sa.Column('trial_id',       sa.Integer(), sa.ForeignKey('lab_trials.id', ondelete='CASCADE'),
                      nullable=False, index=True),
            sa.Column('dept_id',        sa.String(),  nullable=False, index=True),
            sa.Column('readings_json',  sa.Text(),    nullable=False),
            sa.Column('mean_hank',      sa.Float(),   nullable=False),
            sa.Column('cv_pct',         sa.Float(),   nullable=True),
            sa.Column('readings_count', sa.Integer(), nullable=False),
            sa.Column('avg_weight',     sa.Float(),   nullable=True),
            sa.Column('sample_length',  sa.Float(),   nullable=False),
            sa.Column('frame_number',   sa.Integer(), nullable=True),
            sa.Column('notes',          sa.String(),  nullable=True),
            sa.Column('timestamp',      sa.DateTime(), nullable=False, index=True),
        )


def downgrade():
    op.drop_table('lab_samples')
    op.drop_table('lab_benchmarks')
    op.drop_table('lab_trials')
