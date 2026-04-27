"""add production_std_rates and production_entries tables

Revision ID: 013
Revises: 012
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime, timezone


revision = '013'
down_revision = '012'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    # ── 1. production_std_rates ────────────────────────────────────────────────
    if 'production_std_rates' not in tables:
        op.create_table(
            'production_std_rates',
            sa.Column('id',               sa.Integer, primary_key=True),
            sa.Column('dept_id',          sa.String(50), nullable=False),
            sa.Column('machine_number',   sa.Integer,    nullable=True),   # NULL = dept default
            sa.Column('std_rate_kg_per_hr', sa.Float,   nullable=False, default=0.0),
            sa.Column('label',            sa.String(80), nullable=True),   # e.g. "Card #1"
            sa.Column('updated_at',       sa.DateTime,   nullable=True),
        )
        # Unique: one rate per (dept, machine) pair; machine=NULL = dept-level default
        op.create_index(
            'uq_prod_std_rate',
            'production_std_rates',
            ['dept_id', 'machine_number'],
            unique=True,
        )

        # Seed default standard rates (efficiency-method departments only)
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(sa.text(f"""
            INSERT INTO production_std_rates
                (dept_id, machine_number, std_rate_kg_per_hr, label, updated_at)
            VALUES
                ('carding', NULL, 25.0, 'Carding (all cards)',  '{now}'),
                ('breaker', NULL, 65.0, 'Breaker / Drawing',    '{now}'),
                ('rsb',     NULL, 65.0, 'RSB / Finisher',       '{now}')
        """))

    # ── 2. production_entries ─────────────────────────────────────────────────
    if 'production_entries' not in tables:
        op.create_table(
            'production_entries',
            sa.Column('id',             sa.Integer,  primary_key=True),
            sa.Column('dept_id',        sa.String(50), nullable=False, index=True),
            sa.Column('shift',          sa.String(1),  nullable=False),   # 'A'|'B'|'C'
            sa.Column('entry_date',     sa.Date,       nullable=False, index=True),
            sa.Column('machine_number', sa.Integer,    nullable=True),

            # Method tag — drives UI + formula display
            sa.Column('calc_method',    sa.String(20), nullable=False),
            # 'efficiency'  → Carding, Breaker, RSB
            # 'hank_meter'  → Simplex, Ring Frame

            # ── Efficiency method inputs ──────────────────────────────────────
            sa.Column('efficiency_pct',     sa.Float, nullable=True),
            sa.Column('running_hours',      sa.Float, nullable=True),
            sa.Column('std_rate_kg_per_hr', sa.Float, nullable=True),  # snapshot at save time

            # ── Hank meter method inputs ──────────────────────────────────────
            sa.Column('hank_reading',   sa.Float,   nullable=True),   # hanks / spindle (from counter)
            sa.Column('spindle_count',  sa.Integer, nullable=True),   # working spindles this shift
            sa.Column('ne_count',       sa.Float,   nullable=True),   # yarn count (Ne)

            # ── Optional secondary (theoretical) inputs ───────────────────────
            sa.Column('spindle_rpm',    sa.Float, nullable=True),
            sa.Column('tpi',            sa.Float, nullable=True),     # turns per inch

            # ── Computed results ──────────────────────────────────────────────
            sa.Column('primary_kg',     sa.Float, nullable=False),    # main output
            sa.Column('theoretical_kg', sa.Float, nullable=True),     # secondary / validation

            sa.Column('notes',          sa.Text,     nullable=True),
            sa.Column('recorded_at',    sa.DateTime, nullable=False),
            sa.Column('created_at',     sa.DateTime, nullable=False),
        )
        op.create_index('ix_prod_entries_dept_date', 'production_entries', ['dept_id', 'entry_date'])
        op.create_index('ix_prod_entries_date_shift', 'production_entries', ['entry_date', 'shift'])


def downgrade():
    op.drop_table('production_entries')
    op.drop_table('production_std_rates')
