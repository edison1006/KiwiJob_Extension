"""Add ATS career sources and aggregated external jobs.

Revision ID: 20260809_0007
Revises: 20260808_0006
"""

from alembic import op
import sqlalchemy as sa


revision = "20260809_0007"
down_revision = "20260808_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "careersource",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_name", sa.String(length=500), nullable=False),
        sa.Column("company_domain", sa.String(length=500), nullable=True),
        sa.Column("careers_url", sa.String(length=4096), nullable=False),
        sa.Column("source_type", sa.String(length=50), nullable=False),
        sa.Column("tenant_key", sa.String(length=500), nullable=False),
        sa.Column("country_code", sa.String(length=2), nullable=False, server_default="NZ"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("polling_interval_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("next_poll_at", sa.DateTime(), nullable=True),
        sa.Column("last_checked_at", sa.DateTime(), nullable=True),
        sa.Column("last_success_at", sa.DateTime(), nullable=True),
        sa.Column("etag", sa.String(length=1000), nullable=True),
        sa.Column("last_modified", sa.String(length=1000), nullable=True),
        sa.Column("content_hash", sa.String(length=64), nullable=True),
        sa.Column("failure_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.String(length=2000), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_type", "tenant_key", name="uq_career_source_type_tenant"),
    )
    for column in ("company_name", "company_domain", "source_type", "tenant_key", "country_code", "enabled", "next_poll_at"):
        op.create_index(f"ix_careersource_{column}", "careersource", [column])

    op.create_table(
        "externaljob",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("career_source_id", sa.Integer(), nullable=False),
        sa.Column("external_job_id", sa.String(length=500), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("company", sa.String(length=500), nullable=False),
        sa.Column("location", sa.String(length=1000), nullable=True),
        sa.Column("country_code", sa.String(length=2), nullable=True),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("salary", sa.String(length=1000), nullable=True),
        sa.Column("salary_min", sa.Integer(), nullable=True),
        sa.Column("salary_max", sa.Integer(), nullable=True),
        sa.Column("salary_currency", sa.String(length=10), nullable=True),
        sa.Column("employment_type", sa.String(length=500), nullable=True),
        sa.Column("workplace_type", sa.String(length=500), nullable=True),
        sa.Column("url", sa.String(length=4096), nullable=False),
        sa.Column("apply_url", sa.String(length=4096), nullable=True),
        sa.Column("company_url", sa.String(length=4096), nullable=True),
        sa.Column("company_logo_url", sa.String(length=4096), nullable=True),
        sa.Column("posted_date", sa.DateTime(), nullable=True),
        sa.Column("closing_date", sa.DateTime(), nullable=True),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("missing_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("first_seen_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["career_source_id"], ["careersource.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("career_source_id", "external_job_id", name="uq_external_job_source_id"),
    )
    for column in (
        "career_source_id", "external_job_id", "title", "company", "location", "country_code", "salary_min",
        "salary_max", "employment_type", "workplace_type", "url", "posted_date", "closing_date", "active", "last_seen_at",
    ):
        op.create_index(f"ix_externaljob_{column}", "externaljob", [column])


def downgrade() -> None:
    op.drop_table("externaljob")
    op.drop_table("careersource")
