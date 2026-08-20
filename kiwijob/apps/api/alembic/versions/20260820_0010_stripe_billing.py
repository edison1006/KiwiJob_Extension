"""Add Stripe subscription billing state.

Revision ID: 20260820_0010
Revises: 20260809_0009
"""

from alembic import op
import sqlalchemy as sa


revision = "20260820_0010"
down_revision = "20260809_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user", sa.Column("membership_status", sa.String(length=30), nullable=False, server_default="inactive"))
    op.add_column("user", sa.Column("membership_cancel_at_period_end", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("user", sa.Column("stripe_customer_id", sa.String(length=255), nullable=True))
    op.add_column("user", sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True))
    op.create_index("ix_user_membership_status", "user", ["membership_status"])
    op.create_index("ix_user_stripe_customer_id", "user", ["stripe_customer_id"], unique=True)
    op.create_index("ix_user_stripe_subscription_id", "user", ["stripe_subscription_id"], unique=True)
    op.create_table(
        "stripewebhookevent",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.String(length=255), nullable=False),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stripewebhookevent_event_id", "stripewebhookevent", ["event_id"], unique=True)
    op.create_index("ix_stripewebhookevent_event_type", "stripewebhookevent", ["event_type"])


def downgrade() -> None:
    op.drop_index("ix_stripewebhookevent_event_type", table_name="stripewebhookevent")
    op.drop_index("ix_stripewebhookevent_event_id", table_name="stripewebhookevent")
    op.drop_table("stripewebhookevent")
    op.drop_index("ix_user_stripe_subscription_id", table_name="user")
    op.drop_index("ix_user_stripe_customer_id", table_name="user")
    op.drop_index("ix_user_membership_status", table_name="user")
    op.drop_column("user", "stripe_subscription_id")
    op.drop_column("user", "stripe_customer_id")
    op.drop_column("user", "membership_cancel_at_period_end")
    op.drop_column("user", "membership_status")
