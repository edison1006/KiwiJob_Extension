"""Link a verified Gmail identity to an existing KiwiJob account.

Revision ID: 20260808_0006
Revises: 20260808_0005
"""

from alembic import op
import sqlalchemy as sa


revision = "20260808_0006"
down_revision = "20260808_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user", sa.Column("gmail_email", sa.String(), nullable=True))
    op.add_column("user", sa.Column("gmail_subject", sa.String(), nullable=True))
    op.create_index("ix_user_gmail_email", "user", ["gmail_email"], unique=True)
    op.create_index("ix_user_gmail_subject", "user", ["gmail_subject"], unique=True)
    op.execute(
        "UPDATE \"user\" SET gmail_email = lower(email), gmail_subject = auth_provider_subject "
        "WHERE auth_provider = 'google' AND auth_provider_subject <> ''"
    )


def downgrade() -> None:
    op.drop_index("ix_user_gmail_subject", table_name="user")
    op.drop_index("ix_user_gmail_email", table_name="user")
    op.drop_column("user", "gmail_subject")
    op.drop_column("user", "gmail_email")
