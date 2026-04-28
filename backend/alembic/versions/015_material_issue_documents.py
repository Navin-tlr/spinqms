"""add material issue documents

Revision ID: 015
Revises: 014
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa


revision = '015'
down_revision = '014'
branch_labels = None
depends_on = None


def _has_column(inspector, table, column):
    return any(c["name"] == column for c in inspector.get_columns(table))


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = set(inspector.get_table_names())

    if "material_issue_documents" not in tables:
        op.create_table(
            "material_issue_documents",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("document_number", sa.String(40), nullable=False),
            sa.Column("issue_date", sa.Date(), nullable=False),
            sa.Column("shift", sa.String(1), nullable=False),
            sa.Column("reference", sa.String(120), nullable=True),
            sa.Column("status", sa.String(30), nullable=False, server_default="posted"),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_material_issue_documents_document_number", "material_issue_documents", ["document_number"], unique=True)
        op.create_index("ix_material_issue_documents_issue_date", "material_issue_documents", ["issue_date"])

    if "material_issue_lines" not in tables:
        op.create_table(
            "material_issue_lines",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("document_id", sa.Integer(), sa.ForeignKey("material_issue_documents.id"), nullable=False),
            sa.Column("material_id", sa.Integer(), sa.ForeignKey("materials.id"), nullable=False),
            sa.Column("quantity", sa.Float(), nullable=False),
            sa.Column("unit", sa.String(20), nullable=False),
            sa.Column("movement_type", sa.String(10), nullable=False, server_default="GI"),
        )
        op.create_index("ix_material_issue_lines_document_id", "material_issue_lines", ["document_id"])
        op.create_index("ix_material_issue_lines_material_id", "material_issue_lines", ["material_id"])

    if "inventory_movements" in tables and not _has_column(inspector, "inventory_movements", "material_issue_line_id"):
        op.add_column("inventory_movements", sa.Column("material_issue_line_id", sa.Integer(), nullable=True))
        if conn.dialect.name != "sqlite":
            op.create_foreign_key(
                "fk_inventory_movements_material_issue_line",
                "inventory_movements",
                "material_issue_lines",
                ["material_issue_line_id"],
                ["id"],
            )


def downgrade():
    if op.get_bind().dialect.name != "sqlite":
        op.drop_constraint("fk_inventory_movements_material_issue_line", "inventory_movements", type_="foreignkey")
    op.drop_column("inventory_movements", "material_issue_line_id")
    op.drop_table("material_issue_lines")
    op.drop_table("material_issue_documents")
