"""021 — Lot tracking columns + inventory_stock composite PK

Revision ID: 021
Revises: 020
Create Date: 2026-04-30

Changes
-------
1. goods_receipt_lines     — add lot_id VARCHAR(80) nullable
2. inventory_movements     — add lot_id VARCHAR(80) nullable
3. material_issue_lines    — add lot_id VARCHAR(80) nullable
4. inventory_stock         — add lot_id VARCHAR(80) NOT NULL DEFAULT ''
                           — drop single-column PK (material_id)
                           — create composite PK (material_id, lot_id)

The composite PK on inventory_stock allows the ledger to track stock
per (material, lot) bucket. Rows with lot_id='' represent materials
received without a lot designation.

NOTE: The DDL for inventory_stock's PK restructure was applied directly
to Supabase Postgres via MCP (ALTER TABLE) before this file was created,
so the upgrade() here is idempotent — it only adds columns that may still
be missing on a fresh SQLite dev instance.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision      = "021"
down_revision = "020"
branch_labels = None
depends_on    = None


def _add_if_missing(conn, table: str, column: str, col_def):
    insp = sa.inspect(conn)
    existing = {c["name"] for c in insp.get_columns(table)}
    if column not in existing:
        op.add_column(table, col_def)


def upgrade():
    conn = op.get_bind()
    is_pg = conn.dialect.name == "postgresql"

    _add_if_missing(conn, "goods_receipt_lines", "lot_id",
                    sa.Column("lot_id", sa.String(80), nullable=True))

    _add_if_missing(conn, "inventory_movements", "lot_id",
                    sa.Column("lot_id", sa.String(80), nullable=True))

    _add_if_missing(conn, "material_issue_lines", "lot_id",
                    sa.Column("lot_id", sa.String(80), nullable=True))

    insp = sa.inspect(conn)
    stock_cols = {c["name"] for c in insp.get_columns("inventory_stock")}
    if "lot_id" not in stock_cols:
        op.add_column("inventory_stock",
                      sa.Column("lot_id", sa.String(80), nullable=False,
                                server_default=""))
        if is_pg:
            # Drop the old single-column PK and create the composite one.
            # Postgres only — SQLite does not support ALTER TABLE DROP CONSTRAINT.
            conn.execute(sa.text(
                "ALTER TABLE inventory_stock DROP CONSTRAINT IF EXISTS inventory_stock_pkey"
            ))
            conn.execute(sa.text(
                "ALTER TABLE inventory_stock ADD PRIMARY KEY (material_id, lot_id)"
            ))


def downgrade():
    conn = op.get_bind()
    is_pg = conn.dialect.name == "postgresql"
    insp = sa.inspect(conn)

    for table, col in [
        ("goods_receipt_lines",  "lot_id"),
        ("inventory_movements",  "lot_id"),
        ("material_issue_lines", "lot_id"),
    ]:
        cols = {c["name"] for c in insp.get_columns(table)}
        if col in cols:
            op.drop_column(table, col)

    stock_cols = {c["name"] for c in insp.get_columns("inventory_stock")}
    if "lot_id" in stock_cols:
        if is_pg:
            conn.execute(sa.text(
                "ALTER TABLE inventory_stock DROP CONSTRAINT IF EXISTS inventory_stock_pkey"
            ))
            conn.execute(sa.text(
                "ALTER TABLE inventory_stock ADD PRIMARY KEY (material_id)"
            ))
        op.drop_column("inventory_stock", "lot_id")
