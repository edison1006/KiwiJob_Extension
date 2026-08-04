"""Add durable request rate-limit buckets.

Revision ID: 20260804_0003
Revises: 20260723_0002
"""

from alembic import op
import sqlalchemy as sa

revision = "20260804_0003"
down_revision = "20260723_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "requestratelimit",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bucket_key", sa.String(length=64), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("bucket_start", sa.DateTime(), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bucket_key", "action", "bucket_start", name="uq_request_rate_limit_bucket"),
    )
    op.create_index("ix_request_rate_limit_bucket_start", "requestratelimit", ["bucket_start"])


def downgrade() -> None:
    op.drop_index("ix_request_rate_limit_bucket_start", table_name="requestratelimit")
    op.drop_table("requestratelimit")
