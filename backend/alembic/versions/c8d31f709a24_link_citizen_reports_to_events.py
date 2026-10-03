"""Link persisted citizen fire reports to FIRMS event identities.

Revision ID: c8d31f709a24
Revises: a14f9e2c7b61
Create Date: 2026-10-02
"""
from alembic import op
import sqlalchemy as sa


revision = "c8d31f709a24"
down_revision = "a14f9e2c7b61"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("citizen_reports"):
        op.create_table(
            "citizen_reports",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=100), nullable=False),
            sa.Column("report_type", sa.String(length=50), nullable=True),
            sa.Column("latitude", sa.Float(), nullable=True),
            sa.Column("longitude", sa.Float(), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("administrative_unit_id", sa.String(length=36), nullable=True),
            sa.Column("linked_event_id", sa.String(length=80), nullable=True),
            sa.Column("match_distance_km", sa.Float(), nullable=True),
            sa.Column("status", sa.String(length=20), server_default="PENDING", nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
    else:
        columns = {column["name"] for column in inspector.get_columns("citizen_reports")}
        if "linked_event_id" not in columns:
            op.add_column("citizen_reports", sa.Column("linked_event_id", sa.String(length=80), nullable=True))
        if "match_distance_km" not in columns:
            op.add_column("citizen_reports", sa.Column("match_distance_km", sa.Float(), nullable=True))
    indexes = {index["name"] for index in sa.inspect(bind).get_indexes("citizen_reports")}
    if "ix_citizen_reports_linked_event_id" not in indexes:
        op.create_index("ix_citizen_reports_linked_event_id", "citizen_reports", ["linked_event_id"])


def downgrade() -> None:
    op.drop_index("ix_citizen_reports_linked_event_id", table_name="citizen_reports")
    op.drop_column("citizen_reports", "match_distance_km")
    op.drop_column("citizen_reports", "linked_event_id")