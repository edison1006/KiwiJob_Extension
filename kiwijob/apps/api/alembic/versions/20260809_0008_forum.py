"""Add community forum posts, comments, and likes.

Revision ID: 20260809_0008
Revises: 20260809_0007
"""

from alembic import op
import sqlalchemy as sa


revision = "20260809_0008"
down_revision = "20260809_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "forumpost",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False, server_default="job_search"),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("content", sa.String(), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_forumpost_user_id", "forumpost", ["user_id"])
    op.create_index("ix_forumpost_category", "forumpost", ["category"])
    op.create_index("ix_forumpost_created_at", "forumpost", ["created_at"])

    op.create_table(
        "forumcomment",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("post_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("content", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["post_id"], ["forumpost.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_forumcomment_post_id", "forumcomment", ["post_id"])
    op.create_index("ix_forumcomment_user_id", "forumcomment", ["user_id"])
    op.create_index("ix_forumcomment_created_at", "forumcomment", ["created_at"])

    op.create_table(
        "forumpostlike",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("post_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["post_id"], ["forumpost.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("post_id", "user_id", name="uq_forum_post_like_user"),
    )
    op.create_index("ix_forumpostlike_post_id", "forumpostlike", ["post_id"])
    op.create_index("ix_forumpostlike_user_id", "forumpostlike", ["user_id"])


def downgrade() -> None:
    op.drop_table("forumpostlike")
    op.drop_table("forumcomment")
    op.drop_table("forumpost")
