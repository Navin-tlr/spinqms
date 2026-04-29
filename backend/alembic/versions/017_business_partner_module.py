"""Business Partner module — replaces Vendor Master

Revision ID: 017
Revises: 016
Create Date: 2026-04-29

Creates a unified BusinessPartner entity with role-based assignment
(MM_VENDOR, FI_VENDOR, FI_CUSTOMER, SD_CUSTOMER) to replace the flat
Vendor Master.  All Inventory/GR logic now references business_partners.

Also adds material_type to materials and purpose to material_issue_documents.
"""
from alembic import op
import sqlalchemy as sa

revision = '017'
down_revision = '016'
branch_labels = None
depends_on = None


def _has_table(insp, name):
    return name in insp.get_table_names()


def _has_column(insp, table, col):
    if not _has_table(insp, table):
        return False
    return any(c["name"] == col for c in insp.get_columns(table))


def upgrade():
    conn = op.get_bind()
    insp = sa.inspect(conn)
    is_pg = conn.dialect.name != "sqlite"

    # ── 1. business_partners ──────────────────────────────────────────────────
    if not _has_table(insp, "business_partners"):
        op.create_table(
            "business_partners",
            sa.Column("id",             sa.Integer(),     primary_key=True),
            sa.Column("bp_code",        sa.String(40),    nullable=False),
            sa.Column("name",           sa.String(120),   nullable=False),
            sa.Column("status",         sa.String(20),    nullable=False,
                      server_default="Active"),   # Active | Blocked
            sa.Column("address",        sa.Text(),         nullable=True),
            sa.Column("phone",          sa.String(40),    nullable=True),
            sa.Column("email",          sa.String(120),   nullable=True),
            sa.Column("contact_person", sa.String(120),   nullable=True),
            sa.Column("gst_number",     sa.String(40),    nullable=True),
            sa.Column("pan",            sa.String(20),    nullable=True),
            sa.Column("created_at",     sa.DateTime(),    nullable=False),
            sa.Column("updated_at",     sa.DateTime(),    nullable=True),
        )
        op.create_index("ix_business_partners_bp_code", "business_partners",
                        ["bp_code"], unique=True)

    # ── 2. bp_roles ───────────────────────────────────────────────────────────
    if not _has_table(insp, "bp_roles"):
        op.create_table(
            "bp_roles",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("business_partner_id", sa.Integer(),
                      sa.ForeignKey("business_partners.id", ondelete="CASCADE"),
                      nullable=False, index=True),
            # MM_VENDOR | FI_VENDOR | FI_CUSTOMER | SD_CUSTOMER
            sa.Column("role", sa.String(30), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("business_partner_id", "role", name="uq_bp_role"),
        )
        op.create_index("ix_bp_roles_business_partner_id", "bp_roles",
                        ["business_partner_id"])

    # ── 3. goods_receipts — add business_partner_id ───────────────────────────
    if _has_table(insp, "goods_receipts"):
        if not _has_column(insp, "goods_receipts", "business_partner_id"):
            op.add_column("goods_receipts",
                sa.Column("business_partner_id", sa.Integer(),
                          sa.ForeignKey("business_partners.id"), nullable=True))

    # ── 4. materials — add material_type ──────────────────────────────────────
    if _has_table(insp, "materials"):
        if not _has_column(insp, "materials", "material_type"):
            op.add_column("materials",
                sa.Column("material_type", sa.String(40), nullable=True))
            # RAW_MATERIAL | MAINTENANCE | CONSUMABLE

    # ── 5. material_issue_documents — add purpose ────────────────────────────
    if _has_table(insp, "material_issue_documents"):
        if not _has_column(insp, "material_issue_documents", "purpose"):
            op.add_column("material_issue_documents",
                sa.Column("purpose", sa.String(40), nullable=True,
                          server_default="Production"))
            # Production | Maintenance | General


def downgrade():
    op.drop_column("material_issue_documents", "purpose")
    op.drop_column("materials", "material_type")
    op.drop_column("goods_receipts", "business_partner_id")
    op.drop_table("bp_roles")
    op.drop_table("business_partners")
