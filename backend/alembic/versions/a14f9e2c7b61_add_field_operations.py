"""field operations work items

Revision ID: a14f9e2c7b61
Revises: 9370eef9f942
Create Date: 2026-09-14 12:00:00

"""
from alembic import op
import sqlalchemy as sa


revision = "a14f9e2c7b61"
down_revision = "9370eef9f942"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "operational_work_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("task_id", sa.String(length=40), nullable=False),
        sa.Column("campaign", sa.String(length=30), nullable=True),
        sa.Column("phase", sa.String(length=30), nullable=False),
        sa.Column("target_type", sa.String(length=40), nullable=False),
        sa.Column("target", sa.String(length=500), nullable=False),
        sa.Column("required_fields", sa.Text(), nullable=False),
        sa.Column("acceptance", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("priority", sa.String(length=20), nullable=False),
        sa.Column("verified_by", sa.String(length=100), nullable=True),
        sa.Column("verification_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("evidence_ref", sa.String(length=500), nullable=True),
        sa.Column("evidence", sa.Text(), nullable=True),
        sa.Column("rejected_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id", name="uq_operational_work_item_task_id"),
    )


def downgrade() -> None:
    op.drop_table("operational_work_items")
