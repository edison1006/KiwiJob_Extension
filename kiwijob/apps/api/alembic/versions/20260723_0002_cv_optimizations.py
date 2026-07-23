"""Add saved CV optimizations.

Revision ID: 20260723_0002
Revises: 20260526_0001
"""
from alembic import op
import sqlalchemy as sa

revision = "20260723_0002"
down_revision = "20260526_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cvoptimization",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("resume_id", sa.Integer(), nullable=False),
        sa.Column("application_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("match_score", sa.Float(), nullable=False),
        sa.Column("suggestions", sa.JSON(), nullable=True),
        sa.Column("optimized_text", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["application_id"], ["application.id"]),
        sa.ForeignKeyConstraint(["resume_id"], ["resume.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cvoptimization_user_id", "cvoptimization", ["user_id"])
    op.create_index("ix_cvoptimization_resume_id", "cvoptimization", ["resume_id"])
    op.create_index("ix_cvoptimization_application_id", "cvoptimization", ["application_id"])


def downgrade() -> None:
    op.drop_index("ix_cvoptimization_application_id", table_name="cvoptimization")
    op.drop_index("ix_cvoptimization_resume_id", table_name="cvoptimization")
    op.drop_index("ix_cvoptimization_user_id", table_name="cvoptimization")
    op.drop_table("cvoptimization")
