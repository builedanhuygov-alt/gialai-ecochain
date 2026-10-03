"""Field missions + results (closed field loop)."""
from alembic import op
import sqlalchemy as sa

revision = "e7f32b118a45"
down_revision = "d4e51a902c77"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("missions"):
        cols = {c["name"] for c in inspector.get_columns("missions")}
        if "area" not in cols:
            # Legacy phase7 agent-mission table (goal/scope/...): preserve rows
            # under a new name, then create the field-mission table fresh.
            op.rename_table("missions", "missions_legacy_phase7")
            inspector = sa.inspect(bind)
    if not inspector.has_table("missions"):
        op.create_table(
            "missions",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("area", sa.String(length=300), nullable=False),
            sa.Column("cell_id", sa.String(length=40), nullable=True),
            sa.Column("latitude", sa.Float(), nullable=True),
            sa.Column("longitude", sa.Float(), nullable=True),
            sa.Column("risk_at_creation", sa.Integer(), nullable=True),
            sa.Column("priority", sa.String(length=20), nullable=False, server_default="NORMAL"),
            sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="NEW"),
            sa.Column("assignee", sa.String(length=100), nullable=True),
            sa.Column("created_by", sa.String(length=100), nullable=True),
            sa.Column("checklist", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
    if not inspector.has_table("field_results"):
        op.create_table(
            "field_results",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("mission_id", sa.String(length=36), nullable=False),
            sa.Column("outcome", sa.String(length=20), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("photo_hash", sa.String(length=128), nullable=True),
            sa.Column("latitude", sa.Float(), nullable=True),
            sa.Column("longitude", sa.Float(), nullable=True),
            sa.Column("reporter_id", sa.String(length=100), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
            sa.ForeignKeyConstraint(["mission_id"], ["missions.id"]),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    op.drop_table("field_results")
    op.drop_table("missions")
