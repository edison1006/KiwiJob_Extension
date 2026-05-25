"""Initial PostgreSQL schema.

Revision ID: 20260526_0001
Revises:
Create Date: 2026-05-26 11:21:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260526_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("auth_provider", sa.String(), nullable=False),
        sa.Column("auth_provider_subject", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("applicant_profile", sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_auth_provider", "user", ["auth_provider"], unique=False)
    op.create_index("ix_user_auth_provider_subject", "user", ["auth_provider_subject"], unique=False)
    op.create_index("ix_user_email", "user", ["email"], unique=True)

    op.create_table(
        "jobpost",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("company", sa.String(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("salary", sa.String(), nullable=True),
        sa.Column("employment_type", sa.String(), nullable=True),
        sa.Column("workplace_type", sa.String(), nullable=True),
        sa.Column("visa_requirement", sa.String(), nullable=True),
        sa.Column("url", sa.String(), nullable=False),
        sa.Column("apply_url", sa.String(), nullable=True),
        sa.Column("company_url", sa.String(), nullable=True),
        sa.Column("external_job_id", sa.String(), nullable=True),
        sa.Column("source_website", sa.String(), nullable=False),
        sa.Column("posted_date", sa.DateTime(), nullable=True),
        sa.Column("closing_date", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_jobpost_external_job_id", "jobpost", ["external_job_id"], unique=False)
    op.create_index("ix_jobpost_url", "jobpost", ["url"], unique=True)

    op.create_table(
        "application",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("job_post_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("saved_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("match_score", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["job_post_id"], ["jobpost.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "job_post_id", name="uq_application_user_job"),
    )
    op.create_index("ix_application_job_post_id", "application", ["job_post_id"], unique=False)
    op.create_index("ix_application_match_score", "application", ["match_score"], unique=False)
    op.create_index("ix_application_status", "application", ["status"], unique=False)
    op.create_index("ix_application_user_id", "application", ["user_id"], unique=False)

    op.create_table(
        "resume",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("stored_path", sa.String(), nullable=False),
        sa.Column("extracted_text", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_resume_user_id", "resume", ["user_id"], unique=False)

    op.create_table(
        "matchresult",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("application_id", sa.Integer(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["application_id"], ["application.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_matchresult_application_id", "matchresult", ["application_id"], unique=False)

    op.create_table(
        "applicationnote",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("application_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("content", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["application_id"], ["application.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_applicationnote_application_id", "applicationnote", ["application_id"], unique=False)
    op.create_index("ix_applicationnote_user_id", "applicationnote", ["user_id"], unique=False)

    op.create_table(
        "applicationevent",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("application_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("page_url", sa.String(length=4096), nullable=True),
        sa.Column("status_after", sa.String(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["application_id"], ["application.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_applicationevent_application_id", "applicationevent", ["application_id"], unique=False)
    op.create_index("ix_applicationevent_event_type", "applicationevent", ["event_type"], unique=False)
    op.create_index("ix_applicationevent_occurred_at", "applicationevent", ["occurred_at"], unique=False)
    op.create_index("ix_applicationevent_source", "applicationevent", ["source"], unique=False)
    op.create_index("ix_applicationevent_status_after", "applicationevent", ["status_after"], unique=False)
    op.create_index("ix_applicationevent_user_id", "applicationevent", ["user_id"], unique=False)

    op.create_table(
        "emailevent",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("application_id", sa.Integer(), nullable=True),
        sa.Column("external_id", sa.String(), nullable=False),
        sa.Column("subject", sa.String(), nullable=False),
        sa.Column("body_preview", sa.String(), nullable=False),
        sa.Column("received_at", sa.DateTime(), nullable=True),
        sa.Column("parsed_status", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["application_id"], ["application.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_emailevent_application_id", "emailevent", ["application_id"], unique=False)
    op.create_index("ix_emailevent_external_id", "emailevent", ["external_id"], unique=False)
    op.create_index("ix_emailevent_user_id", "emailevent", ["user_id"], unique=False)

    op.create_table(
        "notification",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("channel", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("body", sa.String(), nullable=False),
        sa.Column("read", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notification_channel", "notification", ["channel"], unique=False)
    op.create_index("ix_notification_user_id", "notification", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_notification_user_id", table_name="notification")
    op.drop_index("ix_notification_channel", table_name="notification")
    op.drop_table("notification")

    op.drop_index("ix_emailevent_user_id", table_name="emailevent")
    op.drop_index("ix_emailevent_external_id", table_name="emailevent")
    op.drop_index("ix_emailevent_application_id", table_name="emailevent")
    op.drop_table("emailevent")

    op.drop_index("ix_applicationevent_user_id", table_name="applicationevent")
    op.drop_index("ix_applicationevent_status_after", table_name="applicationevent")
    op.drop_index("ix_applicationevent_source", table_name="applicationevent")
    op.drop_index("ix_applicationevent_occurred_at", table_name="applicationevent")
    op.drop_index("ix_applicationevent_event_type", table_name="applicationevent")
    op.drop_index("ix_applicationevent_application_id", table_name="applicationevent")
    op.drop_table("applicationevent")

    op.drop_index("ix_applicationnote_user_id", table_name="applicationnote")
    op.drop_index("ix_applicationnote_application_id", table_name="applicationnote")
    op.drop_table("applicationnote")

    op.drop_index("ix_matchresult_application_id", table_name="matchresult")
    op.drop_table("matchresult")

    op.drop_index("ix_resume_user_id", table_name="resume")
    op.drop_table("resume")

    op.drop_index("ix_application_user_id", table_name="application")
    op.drop_index("ix_application_status", table_name="application")
    op.drop_index("ix_application_match_score", table_name="application")
    op.drop_index("ix_application_job_post_id", table_name="application")
    op.drop_table("application")

    op.drop_index("ix_jobpost_url", table_name="jobpost")
    op.drop_index("ix_jobpost_external_job_id", table_name="jobpost")
    op.drop_table("jobpost")

    op.drop_index("ix_user_email", table_name="user")
    op.drop_index("ix_user_auth_provider_subject", table_name="user")
    op.drop_index("ix_user_auth_provider", table_name="user")
    op.drop_table("user")
