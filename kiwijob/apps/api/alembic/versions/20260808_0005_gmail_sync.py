"""Add Gmail sync connections and reviewable email events.

Revision ID: 20260808_0005
Revises: 20260805_0004
"""

from alembic import op
import sqlalchemy as sa


revision = "20260808_0005"
down_revision = "20260805_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user", sa.Column("gmail_onboarding_completed", sa.Boolean(), nullable=False, server_default=sa.false()))

    op.add_column("emailevent", sa.Column("provider", sa.String(), nullable=False, server_default="gmail"))
    op.add_column("emailevent", sa.Column("thread_id", sa.String(), nullable=False, server_default=""))
    op.add_column("emailevent", sa.Column("sender", sa.String(), nullable=False, server_default=""))
    op.add_column("emailevent", sa.Column("confidence", sa.Float(), nullable=True))
    op.add_column("emailevent", sa.Column("sync_state", sa.String(), nullable=False, server_default="pending"))
    op.create_index("ix_emailevent_provider", "emailevent", ["provider"])
    op.create_index("ix_emailevent_thread_id", "emailevent", ["thread_id"])
    op.create_index("ix_emailevent_sync_state", "emailevent", ["sync_state"])
    op.execute("UPDATE emailevent SET external_id = 'legacy-email-event-' || id::text WHERE external_id = ''")
    op.execute(
        "DELETE FROM emailevent older USING emailevent newer "
        "WHERE older.user_id = newer.user_id AND older.provider = newer.provider "
        "AND older.external_id = newer.external_id AND older.id > newer.id"
    )
    op.create_unique_constraint(
        "uq_email_event_provider_message",
        "emailevent",
        ["user_id", "provider", "external_id"],
    )

    op.create_table(
        "emailconnection",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("email_address", sa.String(), nullable=False),
        sa.Column("encrypted_refresh_token", sa.String(), nullable=False),
        sa.Column("granted_scopes", sa.String(), nullable=False),
        sa.Column("history_id", sa.String(), nullable=True),
        sa.Column("connected_at", sa.DateTime(), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "provider", name="uq_email_connection_user_provider"),
    )
    op.create_index("ix_emailconnection_user_id", "emailconnection", ["user_id"])
    op.create_index("ix_emailconnection_provider", "emailconnection", ["provider"])


def downgrade() -> None:
    op.drop_index("ix_emailconnection_provider", table_name="emailconnection")
    op.drop_index("ix_emailconnection_user_id", table_name="emailconnection")
    op.drop_table("emailconnection")

    op.drop_constraint("uq_email_event_provider_message", "emailevent", type_="unique")
    op.drop_index("ix_emailevent_sync_state", table_name="emailevent")
    op.drop_index("ix_emailevent_thread_id", table_name="emailevent")
    op.drop_index("ix_emailevent_provider", table_name="emailevent")
    op.drop_column("emailevent", "sync_state")
    op.drop_column("emailevent", "confidence")
    op.drop_column("emailevent", "sender")
    op.drop_column("emailevent", "thread_id")
    op.drop_column("emailevent", "provider")

    op.drop_column("user", "gmail_onboarding_completed")
