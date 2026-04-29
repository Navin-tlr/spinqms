"""018 — BPMaterial table + business_partner_id on purchase_orders

Revision ID: 018
Revises: 017
Create Date: 2026-04-29

Changes
-------
1. Create `bp_materials` table (Business Partner – Material procurement links)
   replacing legacy `vendor_materials` in business logic.
2. Add `business_partner_id` FK to `purchase_orders`.

All DDL statements are idempotent (existence-checked before execution).
Legacy `vendors`, `vendor_materials`, and `vendor_id` columns are preserved
in the DB for historical reference — they are no longer used by application code.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# Alembic revision identifiers
revision      = "018"
down_revision = "017"
branch_labels = None
depends_on    = None


def upgrade():
    conn    = op.get_bind()
    dialect = conn.dialect.name          # 'postgresql' | 'sqlite'
    insp    = sa.inspect(conn)

    # ── 1. Create bp_materials table ──────────────────────────────────────────
    existing_tables = insp.get_table_names()
    if "bp_materials" not in existing_tables:
        op.create_table(
            "bp_materials",
            sa.Column("id",                  sa.Integer,     primary_key=True),
            sa.Column("business_partner_id", sa.Integer,     sa.ForeignKey(
                "business_partners.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("material_id",         sa.Integer,     sa.ForeignKey(
                "materials.id",         ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("is_preferred",        sa.Boolean,     nullable=False, server_default="false"),
            sa.Column("lead_time_days",      sa.Float,       nullable=True),
            sa.Column("last_price",          sa.Float,       nullable=True),
            sa.Column("last_price_date",     sa.Date,        nullable=True),
            sa.Column("notes",               sa.Text,        nullable=True),
            sa.Column("created_at",          sa.DateTime,    nullable=False,
                      server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.UniqueConstraint("business_partner_id", "material_id", name="uq_bp_material"),
        )

    # ── 2. Add business_partner_id to purchase_orders ─────────────────────────
    po_cols = {c["name"] for c in insp.get_columns("purchase_orders")}
    if "business_partner_id" not in po_cols:
        op.add_column(
            "purchase_orders",
            sa.Column("business_partner_id", sa.Integer,
                      sa.ForeignKey("business_partners.id"),
                      nullable=True),
        )


def downgrade():
    conn = op.get_bind()
    insp = sa.inspect(conn)

    # Drop business_partner_id from purchase_orders
    po_cols = {c["name"] for c in insp.get_columns("purchase_orders")}
    if "business_partner_id" in po_cols:
        op.drop_column("purchase_orders", "business_partner_id")

    # Drop bp_materials table
    if "bp_materials" in insp.get_table_names():
        op.drop_table("bp_materials")
