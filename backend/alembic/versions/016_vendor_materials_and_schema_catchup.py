"""Vendor-material linking + schema catch-up from MCP-applied changes

Revision ID: 016
Revises: 015
Create Date: 2026-04-28

This migration is fully idempotent — every DDL statement checks for existence
first.  It formalises schema changes that were applied directly to Supabase in a
prior session (vendors table, nullable columns on goods_receipts / materials /
material_issue_documents) and adds the new vendor_materials join table.
"""
from alembic import op
import sqlalchemy as sa

revision = '016'
down_revision = '015'
branch_labels = None
depends_on = None


def _has_table(inspector, name):
    return name in inspector.get_table_names()


def _has_column(inspector, table, column):
    if not _has_table(inspector, table):
        return False
    return any(c["name"] == column for c in inspector.get_columns(table))


def upgrade():
    conn = op.get_bind()
    insp = sa.inspect(conn)
    is_pg = conn.dialect.name != "sqlite"

    # ── 1. vendors ────────────────────────────────────────────────────────────
    if not _has_table(insp, "vendors"):
        op.create_table(
            "vendors",
            sa.Column("id",             sa.Integer(),     primary_key=True),
            sa.Column("code",           sa.String(40),    nullable=False),
            sa.Column("name",           sa.String(120),   nullable=False),
            sa.Column("contact_person", sa.String(120),   nullable=True),
            sa.Column("phone",          sa.String(40),    nullable=True),
            sa.Column("email",          sa.String(120),   nullable=True),
            sa.Column("gst_number",     sa.String(40),    nullable=True),
            sa.Column("address",        sa.Text(),         nullable=True),
            sa.Column("status",         sa.String(20),    nullable=False, server_default="active"),
            sa.Column("created_at",     sa.DateTime(),    nullable=False),
            sa.Column("updated_at",     sa.DateTime(),    nullable=True),
        )
        op.create_index("ix_vendors_code", "vendors", ["code"], unique=True)

    # ── 2. materials — add category / description ─────────────────────────────
    if not _has_column(insp, "materials", "category"):
        op.add_column("materials", sa.Column("category",    sa.String(60), nullable=True))
    if not _has_column(insp, "materials", "description"):
        op.add_column("materials", sa.Column("description", sa.Text(),     nullable=True))

    # ── 3. goods_receipts — make purchase_order_id nullable; add vendor/ref/attachment ──
    if _has_table(insp, "goods_receipts"):
        if not _has_column(insp, "goods_receipts", "vendor_id"):
            op.add_column("goods_receipts",
                sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id"), nullable=True))
        if not _has_column(insp, "goods_receipts", "reference"):
            op.add_column("goods_receipts",
                sa.Column("reference", sa.String(120), nullable=True))
        if not _has_column(insp, "goods_receipts", "attachment_url"):
            op.add_column("goods_receipts",
                sa.Column("attachment_url", sa.Text(), nullable=True))
        # Make purchase_order_id nullable (Postgres only — SQLite ignores NOT NULL in most contexts)
        if is_pg and _has_column(insp, "goods_receipts", "purchase_order_id"):
            op.alter_column("goods_receipts", "purchase_order_id", nullable=True)

    # ── 4. goods_receipt_lines — make purchase_order_line_id / rate nullable ─
    if _has_table(insp, "goods_receipt_lines"):
        if is_pg and _has_column(insp, "goods_receipt_lines", "purchase_order_line_id"):
            op.alter_column("goods_receipt_lines", "purchase_order_line_id", nullable=True)
        if is_pg and _has_column(insp, "goods_receipt_lines", "rate"):
            op.alter_column("goods_receipt_lines", "rate", nullable=True)

    # ── 5. material_issue_documents — make shift nullable ─────────────────────
    if _has_table(insp, "material_issue_documents"):
        if is_pg and _has_column(insp, "material_issue_documents", "shift"):
            op.alter_column("material_issue_documents", "shift", nullable=True,
                            server_default="D")

    # ── 6. vendor_materials (new) ─────────────────────────────────────────────
    if not _has_table(insp, "vendor_materials"):
        op.create_table(
            "vendor_materials",
            sa.Column("id",             sa.Integer(),  primary_key=True),
            sa.Column("vendor_id",      sa.Integer(),
                      sa.ForeignKey("vendors.id",   ondelete="CASCADE"), nullable=False),
            sa.Column("material_id",    sa.Integer(),
                      sa.ForeignKey("materials.id", ondelete="CASCADE"), nullable=False),
            sa.Column("is_preferred",   sa.Boolean(),  nullable=False, server_default=sa.false()),
            sa.Column("lead_time_days", sa.Float(),    nullable=True),
            sa.Column("last_price",     sa.Float(),    nullable=True),
            sa.Column("last_price_date",sa.Date(),     nullable=True),
            sa.Column("notes",          sa.Text(),     nullable=True),
            sa.Column("created_at",     sa.DateTime(), nullable=False,
                      server_default=sa.text("NOW()")),
            sa.UniqueConstraint("vendor_id", "material_id", name="uq_vendor_material"),
        )
        op.create_index("ix_vendor_materials_vendor_id",   "vendor_materials", ["vendor_id"])
        op.create_index("ix_vendor_materials_material_id", "vendor_materials", ["material_id"])


def downgrade():
    op.drop_table("vendor_materials")
