"""Add forum attachments.

Revision ID: 20260809_0009
Revises: 20260809_0008
"""

from alembic import op
import sqlalchemy as sa


revision = "20260809_0009"
down_revision = "20260809_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "forumattachment",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("post_id", sa.Integer(), nullable=True),
        sa.Column("filename", sa.String(length=500), nullable=False),
        sa.Column("stored_path", sa.String(length=2000), nullable=False),
        sa.Column("media_type", sa.String(length=200), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False, server_default="file"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["post_id"], ["forumpost.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_forumattachment_user_id", "forumattachment", ["user_id"])
    op.create_index("ix_forumattachment_post_id", "forumattachment", ["post_id"])
    op.create_index("ix_forumattachment_created_at", "forumattachment", ["created_at"])


def downgrade() -> None:
    op.drop_table("forumattachment")
