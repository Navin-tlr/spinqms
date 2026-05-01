"""020 — Add document_date to goods_receipts

Revision ID: 020
Revises: 019
Create Date: 2026-04-30

Changes
-------
Add `document_date` (Date, nullable) to `goods_receipts`.
This is the date on the supplier's invoice — distinct from `receipt_date`
which is the posting date in our system.

Column was present in the SQLAlchemy model since 018 but was omitted from
all prior migrations, causing INSERT failures on Postgres.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision      = "020"
down_revision = "019"
branch_labels = None
depends_on    = None


def upgrade():
    conn = op.get_bind()
    insp = sa.inspect(conn)

    existing_cols = {c["name"] for c in insp.get_columns("goods_receipts")}
    if "document_date" not in existing_cols:
        op.add_column(
            "goods_receipts",
            sa.Column("document_date", sa.Date, nullable=True),
        )


def downgrade():
    conn = op.get_bind()
    insp = sa.inspect(conn)

    existing_cols = {c["name"] for c in insp.get_columns("goods_receipts")}
    if "document_date" in existing_cols:
        op.drop_column("goods_receipts", "document_date")
