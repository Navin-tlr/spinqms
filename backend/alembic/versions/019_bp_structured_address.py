"""019 — Business Partner structured address + SAP general-data fields

Revision ID: 019
Revises: 018
Create Date: 2026-04-29

Changes
-------
Adds SAP-standard structured fields to business_partners:

  General Data
  - name_2        VARCHAR(120)  — second name line
  - grouping      VARCHAR(40)   — BP account group / grouping key
  - bp_category   VARCHAR(20)   — 'Organization' | 'Individual'

  Standard Address (SAP-style structured address)
  - street        VARCHAR(120)
  - house_number  VARCHAR(20)
  - city          VARCHAR(80)
  - postal_code   VARCHAR(20)
  - country       VARCHAR(80)   — default 'India'
  - region        VARCHAR(80)   — State / Province
  - language      VARCHAR(20)   — default 'EN'

The legacy `address` (Text) column is preserved for backward compatibility.
All DDL is idempotent.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision      = "019"
down_revision = "018"
branch_labels = None
depends_on    = None

# New columns to add to business_partners
_NEW_COLS = [
    ("name_2",       sa.String(120), None),
    ("grouping",     sa.String(40),  None),
    ("bp_category",  sa.String(20),  "Organization"),
    ("street",       sa.String(120), None),
    ("house_number", sa.String(20),  None),
    ("city",         sa.String(80),  None),
    ("postal_code",  sa.String(20),  None),
    ("country",      sa.String(80),  "India"),
    ("region",       sa.String(80),  None),
    ("language",     sa.String(20),  "EN"),
]


def upgrade():
    conn = op.get_bind()
    insp = sa.inspect(conn)

    if "business_partners" not in insp.get_table_names():
        # Table doesn't exist at all — nothing to add, migration 017 will create it
        return

    existing_cols = {c["name"] for c in insp.get_columns("business_partners")}

    for col_name, col_type, default in _NEW_COLS:
        if col_name not in existing_cols:
            col = sa.Column(col_name, col_type, nullable=True)
            op.add_column("business_partners", col)
            # Set default for existing rows where meaningful
            if default is not None:
                op.execute(
                    sa.text(
                        f"UPDATE business_partners SET {col_name} = :val WHERE {col_name} IS NULL"
                    ).bindparams(val=default)
                )


def downgrade():
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "business_partners" not in insp.get_table_names():
        return
    existing_cols = {c["name"] for c in insp.get_columns("business_partners")}
    for col_name, _, _ in _NEW_COLS:
        if col_name in existing_cols:
            op.drop_column("business_partners", col_name)
