"""Add server-side membership entitlements.

Revision ID: 20260805_0004
Revises: 20260804_0003
"""

from alembic import op
import sqlalchemy as sa

revision = "20260805_0004"
down_revision = "20260804_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user", sa.Column("membership_tier", sa.String(length=20), nullable=False, server_default="free"))
    op.add_column("user", sa.Column("membership_expires_at", sa.DateTime(), nullable=True))
    op.create_index("ix_user_membership_tier", "user", ["membership_tier"])
    op.create_index("ix_user_membership_expires_at", "user", ["membership_expires_at"])


def downgrade() -> None:
    op.drop_index("ix_user_membership_expires_at", table_name="user")
    op.drop_index("ix_user_membership_tier", table_name="user")
    op.drop_column("user", "membership_expires_at")
    op.drop_column("user", "membership_tier")
