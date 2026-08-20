"""Separate Stripe sandbox and live billing identities.

Revision ID: 20260820_0011
Revises: 20260820_0010
"""

from alembic import op
import sqlalchemy as sa


revision = "20260820_0011"
down_revision = "20260820_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user", sa.Column("stripe_livemode", sa.Boolean(), nullable=True))
    op.create_index("ix_user_stripe_livemode", "user", ["stripe_livemode"])
    op.execute(
        sa.text(
            'UPDATE "user" SET stripe_livemode = false '
            "WHERE stripe_customer_id IS NOT NULL OR stripe_subscription_id IS NOT NULL"
        )
    )


def downgrade() -> None:
    op.drop_index("ix_user_stripe_livemode", table_name="user")
    op.drop_column("user", "stripe_livemode")
