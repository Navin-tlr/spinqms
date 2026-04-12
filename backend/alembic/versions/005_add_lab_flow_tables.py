"""add YarnLAB flow tables for rsb/simplex/ringframe traceability

Revision ID: 005
Revises: 004
Create Date: 2026-04-12
"""

from alembic import op
import sqlalchemy as sa


revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if "lab_rsb_cans" not in existing_tables:
        op.create_table(
            "lab_rsb_cans",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "trial_id",
                sa.Integer(),
                sa.ForeignKey("lab_trials.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("slot", sa.Integer(), nullable=False),
            sa.Column("hank_value", sa.Float(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("is_perfect", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.UniqueConstraint("trial_id", "slot", name="uq_rsb_trial_slot"),
        )
        trials = conn.execute(sa.text("SELECT id FROM lab_trials")).fetchall()
        for (trial_id,) in trials:
            for slot in range(1, 6):
                conn.execute(
                    sa.text(
                        "INSERT INTO lab_rsb_cans (trial_id, slot, is_perfect) "
                        "VALUES (:trial_id, :slot, false)"
                    ),
                    {"trial_id": trial_id, "slot": slot},
                )

    if "lab_simplex_bobbins" not in existing_tables:
        op.create_table(
            "lab_simplex_bobbins",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "trial_id",
                sa.Integer(),
                sa.ForeignKey("lab_trials.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("label", sa.String(), nullable=False),
            sa.Column("hank_value", sa.Float(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("verified_same_hank", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("doff_minutes", sa.Integer(), nullable=False, server_default=sa.text("180")),
            sa.Column("order_index", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )

    if "lab_simplex_inputs" not in existing_tables:
        op.create_table(
            "lab_simplex_inputs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "bobbin_id",
                sa.Integer(),
                sa.ForeignKey("lab_simplex_bobbins.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column(
                "rsb_can_id",
                sa.Integer(),
                sa.ForeignKey("lab_rsb_cans.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.UniqueConstraint("bobbin_id", "rsb_can_id", name="uq_simplex_input"),
        )

    if "lab_ringframe_cops" not in existing_tables:
        op.create_table(
            "lab_ringframe_cops",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "trial_id",
                sa.Integer(),
                sa.ForeignKey("lab_trials.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("label", sa.String(), nullable=False),
            sa.Column("hank_value", sa.Float(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )

    if "lab_ringframe_inputs" not in existing_tables:
        op.create_table(
            "lab_ringframe_inputs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "cop_id",
                sa.Integer(),
                sa.ForeignKey("lab_ringframe_cops.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column(
                "simplex_bobbin_id",
                sa.Integer(),
                sa.ForeignKey("lab_simplex_bobbins.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.UniqueConstraint("cop_id", "simplex_bobbin_id", name="uq_ringframe_input"),
        )


def downgrade():
    op.drop_table("lab_ringframe_inputs")
    op.drop_table("lab_ringframe_cops")
    op.drop_table("lab_simplex_inputs")
    op.drop_table("lab_simplex_bobbins")
    op.drop_table("lab_rsb_cans")
