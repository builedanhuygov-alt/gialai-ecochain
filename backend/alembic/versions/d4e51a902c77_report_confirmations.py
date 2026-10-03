"""Community report confirmations (one user/device per report)."""
from alembic import op
import sqlalchemy as sa

revision = "d4e51a902c77"
down_revision = "c8d31f709a24"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("report_confirmations"):
        op.create_table(
            "report_confirmations",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("report_id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=100), nullable=False),
            sa.Column("device_id", sa.String(length=100), nullable=True),
            sa.Column("confirmed", sa.Boolean(), nullable=False),
            sa.Column("latitude", sa.Float(), nullable=True),
            sa.Column("longitude", sa.Float(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.ForeignKeyConstraint(["report_id"], ["citizen_reports.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("report_id", "user_id", name="uq_report_user"),
            sa.UniqueConstraint("report_id", "device_id", name="uq_report_device"),
        )
    else:
        existing = {c["name"] for c in inspector.get_columns("report_confirmations")}
        if "device_id" not in existing:
            op.add_column("report_confirmations", sa.Column("device_id", sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_table("report_confirmations")
