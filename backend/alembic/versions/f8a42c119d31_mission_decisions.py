"""Mission decisions + extended field form (area context, no rescoring)."""
from alembic import op
import sqlalchemy as sa

revision = "f8a42c119d31"
down_revision = "e7f32b118a45"
branch_labels = None
depends_on = None

_MISSION_COLS = [
    ("zone", sa.String(length=100)),
    ("inspection_priority", sa.Integer()),
    ("decision", sa.String(length=20)),
    ("decided_by", sa.String(length=100)),
]
_RESULT_COLS = [
    ("observed_at", sa.DateTime(timezone=True)),
    ("vegetation", sa.Text()),
    ("smoke_heat", sa.Text()),
    ("human_activity", sa.Text()),
    ("water_source", sa.Text()),
    ("access", sa.Text()),
    ("match_result", sa.String(length=20)),
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("missions"):
        have = {c["name"] for c in inspector.get_columns("missions")}
        for name, typ in _MISSION_COLS:
            if name not in have:
                op.add_column("missions", sa.Column(name, typ, nullable=True))
    if inspector.has_table("field_results"):
        have = {c["name"] for c in inspector.get_columns("field_results")}
        for name, typ in _RESULT_COLS:
            if name not in have:
                op.add_column("field_results", sa.Column(name, typ, nullable=True))


def downgrade() -> None:
    for name, _typ in _RESULT_COLS:
        try:
            op.drop_column("field_results", name)
        except Exception:
            pass
    for name, _typ in _MISSION_COLS:
        try:
            op.drop_column("missions", name)
        except Exception:
            pass
