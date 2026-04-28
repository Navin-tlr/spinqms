"""add material inventory mrp purchase flow

Revision ID: 014
Revises: 013
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime, timezone


revision = '014'
down_revision = '013'
branch_labels = None
depends_on = None


def _has_column(inspector, table, column):
    return any(c["name"] == column for c in inspector.get_columns(table))


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = set(inspector.get_table_names())
    now = datetime.now(timezone.utc).isoformat()

    if "production_entries" in tables:
        if not _has_column(inspector, "production_entries", "is_void"):
            op.add_column("production_entries", sa.Column("is_void", sa.Boolean(), nullable=False, server_default=sa.false()))
        if not _has_column(inspector, "production_entries", "voided_at"):
            op.add_column("production_entries", sa.Column("voided_at", sa.DateTime(), nullable=True))
        if not _has_column(inspector, "production_entries", "void_reason"):
            op.add_column("production_entries", sa.Column("void_reason", sa.Text(), nullable=True))

    if "materials" not in tables:
        op.create_table(
            "materials",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("code", sa.String(40), nullable=False),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("base_unit", sa.String(20), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_materials_code", "materials", ["code"], unique=True)

    if "production_material_consumptions" not in tables:
        op.create_table(
            "production_material_consumptions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("production_entry_id", sa.Integer(), sa.ForeignKey("production_entries.id"), nullable=False),
            sa.Column("material_id", sa.Integer(), sa.ForeignKey("materials.id"), nullable=False),
            sa.Column("quantity", sa.Float(), nullable=False),
            sa.Column("unit", sa.String(20), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("production_entry_id", "material_id", name="uq_prod_consumption_material"),
        )
        op.create_index("ix_production_material_consumptions_production_entry_id", "production_material_consumptions", ["production_entry_id"])
        op.create_index("ix_production_material_consumptions_material_id", "production_material_consumptions", ["material_id"])

    if "inventory_movements" not in tables:
        op.create_table(
            "inventory_movements",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("material_id", sa.Integer(), sa.ForeignKey("materials.id"), nullable=False),
            sa.Column("movement_type", sa.String(30), nullable=False),
            sa.Column("source_type", sa.String(40), nullable=False),
            sa.Column("source_id", sa.Integer(), nullable=True),
            sa.Column("production_consumption_id", sa.Integer(), sa.ForeignKey("production_material_consumptions.id"), nullable=True),
            sa.Column("goods_receipt_line_id", sa.Integer(), nullable=True),
            sa.Column("quantity_delta", sa.Float(), nullable=False),
            sa.Column("unit", sa.String(20), nullable=False),
            sa.Column("movement_date", sa.Date(), nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_by", sa.String(80), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_inventory_movements_material_id", "inventory_movements", ["material_id"])
        op.create_index("ix_inventory_movements_source_id", "inventory_movements", ["source_id"])
        op.create_index("ix_inventory_movements_movement_date", "inventory_movements", ["movement_date"])
        op.create_index("ix_inventory_movements_created_at", "inventory_movements", ["created_at"])
        op.create_index("ix_inventory_movements_material_date", "inventory_movements", ["material_id", "movement_date"])

    if "inventory_stock" not in tables:
        op.create_table(
            "inventory_stock",
            sa.Column("material_id", sa.Integer(), sa.ForeignKey("materials.id"), primary_key=True),
            sa.Column("quantity_on_hand", sa.Float(), nullable=False, server_default="0"),
            sa.Column("unit", sa.String(20), nullable=False),
            sa.Column("last_movement_id", sa.Integer(), sa.ForeignKey("inventory_movements.id"), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    if "material_planning_params" not in tables:
        op.create_table(
            "material_planning_params",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("material_id", sa.Integer(), sa.ForeignKey("materials.id"), nullable=False),
            sa.Column("lead_time_days", sa.Float(), nullable=False, server_default="5"),
            sa.Column("safety_stock_qty", sa.Float(), nullable=False, server_default="0"),
            sa.Column("reorder_qty", sa.Float(), nullable=False, server_default="0"),
            sa.Column("critical_days_left", sa.Float(), nullable=False, server_default="2"),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_material_planning_params_material_id", "material_planning_params", ["material_id"], unique=True)

    if "purchase_recommendations" not in tables:
        op.create_table(
            "purchase_recommendations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("material_id", sa.Integer(), sa.ForeignKey("materials.id"), nullable=False),
            sa.Column("status", sa.String(30), nullable=False, server_default="open"),
            sa.Column("suggested_qty", sa.Float(), nullable=False),
            sa.Column("unit", sa.String(20), nullable=False),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("decision_support", sa.Text(), nullable=True),
            sa.Column("stock_at_creation", sa.Float(), nullable=False),
            sa.Column("reorder_level", sa.Float(), nullable=False),
            sa.Column("avg_consumption", sa.Float(), nullable=False),
            sa.Column("price_trend", sa.String(20), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("converted_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_purchase_recommendations_material_id", "purchase_recommendations", ["material_id"])
        op.create_index("ix_purchase_recommendations_created_at", "purchase_recommendations", ["created_at"])

    if "purchase_orders" not in tables:
        op.create_table(
            "purchase_orders",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("po_number", sa.String(40), nullable=False),
            sa.Column("supplier", sa.String(120), nullable=True),
            sa.Column("status", sa.String(30), nullable=False, server_default="open"),
            sa.Column("order_date", sa.Date(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_purchase_orders_po_number", "purchase_orders", ["po_number"], unique=True)

    if "purchase_order_lines" not in tables:
        op.create_table(
            "purchase_order_lines",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("purchase_order_id", sa.Integer(), sa.ForeignKey("purchase_orders.id"), nullable=False),
            sa.Column("recommendation_id", sa.Integer(), sa.ForeignKey("purchase_recommendations.id"), nullable=True),
            sa.Column("material_id", sa.Integer(), sa.ForeignKey("materials.id"), nullable=False),
            sa.Column("quantity_ordered", sa.Float(), nullable=False),
            sa.Column("unit", sa.String(20), nullable=False),
            sa.Column("rate", sa.Float(), nullable=False),
            sa.Column("quantity_received", sa.Float(), nullable=False, server_default="0"),
        )
        op.create_index("ix_purchase_order_lines_purchase_order_id", "purchase_order_lines", ["purchase_order_id"])
        op.create_index("ix_purchase_order_lines_material_id", "purchase_order_lines", ["material_id"])

    if "goods_receipts" not in tables:
        op.create_table(
            "goods_receipts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("gr_number", sa.String(40), nullable=False),
            sa.Column("purchase_order_id", sa.Integer(), sa.ForeignKey("purchase_orders.id"), nullable=False),
            sa.Column("receipt_date", sa.Date(), nullable=False),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_goods_receipts_gr_number", "goods_receipts", ["gr_number"], unique=True)
        op.create_index("ix_goods_receipts_purchase_order_id", "goods_receipts", ["purchase_order_id"])

    if "goods_receipt_lines" not in tables:
        op.create_table(
            "goods_receipt_lines",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("goods_receipt_id", sa.Integer(), sa.ForeignKey("goods_receipts.id"), nullable=False),
            sa.Column("purchase_order_line_id", sa.Integer(), sa.ForeignKey("purchase_order_lines.id"), nullable=False),
            sa.Column("material_id", sa.Integer(), sa.ForeignKey("materials.id"), nullable=False),
            sa.Column("quantity_received", sa.Float(), nullable=False),
            sa.Column("unit", sa.String(20), nullable=False),
            sa.Column("rate", sa.Float(), nullable=False),
        )
        op.create_index("ix_goods_receipt_lines_material_id", "goods_receipt_lines", ["material_id"])
        op.create_index("ix_goods_receipt_lines_goods_receipt_id", "goods_receipt_lines", ["goods_receipt_id"])
        op.create_index("ix_goods_receipt_lines_purchase_order_line_id", "goods_receipt_lines", ["purchase_order_line_id"])
        if conn.dialect.name != "sqlite":
            op.create_foreign_key(
                "fk_inventory_movements_gr_line",
                "inventory_movements",
                "goods_receipt_lines",
                ["goods_receipt_line_id"],
                ["id"],
            )

    if "material_market_prices" not in tables:
        op.create_table(
            "material_market_prices",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("material_id", sa.Integer(), sa.ForeignKey("materials.id"), nullable=False),
            sa.Column("price_date", sa.Date(), nullable=False),
            sa.Column("price", sa.Float(), nullable=False),
            sa.Column("unit", sa.String(20), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("material_id", "price_date", name="uq_material_market_price_date"),
        )
        op.create_index("ix_material_market_prices_material_id", "material_market_prices", ["material_id"])
        op.create_index("ix_material_market_prices_price_date", "material_market_prices", ["price_date"])

    # Seed the three factory materials, initial opening stock as ledger movements, and planning defaults.
    conn.execute(sa.text("""
        INSERT INTO materials (code, name, base_unit, is_active, created_at)
        VALUES
            ('COTTON', 'Cotton', 'Bales', TRUE, :now),
            ('VISCOSE', 'Viscose', 'Kg', TRUE, :now),
            ('LYOCELL', 'Lyocell', 'Kg', TRUE, :now)
        ON CONFLICT (code) DO NOTHING
    """), {"now": now})

    defaults = [
        ("COTTON", 100.0, "Bales", 5.0, 20.0, 50.0),
        ("VISCOSE", 2000.0, "Kg", 5.0, 300.0, 500.0),
        ("LYOCELL", 1500.0, "Kg", 5.0, 200.0, 400.0),
    ]
    for code, qty, unit, lead, safety, reorder in defaults:
        material_id = conn.execute(sa.text("SELECT id FROM materials WHERE code = :code"), {"code": code}).scalar()
        conn.execute(sa.text("""
            INSERT INTO material_planning_params
                (material_id, lead_time_days, safety_stock_qty, reorder_qty, critical_days_left, updated_at)
            VALUES (:material_id, :lead, :safety, :reorder, 2, :now)
            ON CONFLICT DO NOTHING
        """), {"material_id": material_id, "lead": lead, "safety": safety, "reorder": reorder, "now": now})

        existing_opening = conn.execute(sa.text("""
            SELECT id FROM inventory_movements
            WHERE material_id = :material_id AND source_type = 'opening_balance'
            LIMIT 1
        """), {"material_id": material_id}).scalar()
        if not existing_opening:
            movement_id = conn.execute(sa.text("""
                INSERT INTO inventory_movements
                    (material_id, movement_type, source_type, source_id, quantity_delta, unit, movement_date, notes, created_at)
                VALUES (:material_id, 'receipt', 'opening_balance', NULL, :qty, :unit, CURRENT_DATE, 'Seed opening stock', :now)
                RETURNING id
            """), {"material_id": material_id, "qty": qty, "unit": unit, "now": now}).scalar()
            conn.execute(sa.text("""
                INSERT INTO inventory_stock (material_id, quantity_on_hand, unit, last_movement_id, updated_at)
                VALUES (:material_id, :qty, :unit, :movement_id, :now)
                ON CONFLICT (material_id) DO NOTHING
            """), {"material_id": material_id, "qty": qty, "unit": unit, "movement_id": movement_id, "now": now})


def downgrade():
    op.drop_table("material_market_prices")
    op.drop_table("inventory_stock")
    op.drop_table("inventory_movements")
    op.drop_table("goods_receipt_lines")
    op.drop_table("goods_receipts")
    op.drop_table("purchase_order_lines")
    op.drop_table("purchase_orders")
    op.drop_table("purchase_recommendations")
    op.drop_table("material_planning_params")
    op.drop_table("production_material_consumptions")
    op.drop_table("materials")
    op.drop_column("production_entries", "void_reason")
    op.drop_column("production_entries", "voided_at")
    op.drop_column("production_entries", "is_void")
