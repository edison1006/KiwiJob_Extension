from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel

from app.core.time import utc_now


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(default="demo@kiwijob.local", index=True, unique=True)
    password_hash: str = Field(default="")
    display_name: str = Field(default="")
    auth_provider: str = Field(default="password", index=True)
    auth_provider_subject: str = Field(default="", index=True)
    gmail_email: Optional[str] = Field(default=None, index=True, unique=True)
    gmail_subject: Optional[str] = Field(default=None, index=True, unique=True)
    membership_tier: str = Field(default="free", index=True, max_length=20)
    membership_expires_at: Optional[datetime] = Field(default=None, index=True)
    gmail_onboarding_completed: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utc_now)
    applicant_profile: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON))

    applications: list["Application"] = Relationship(back_populates="user")
    resumes: list["Resume"] = Relationship(back_populates="user")


class JobPost(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    company: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    salary: Optional[str] = None
    employment_type: Optional[str] = None
    workplace_type: Optional[str] = None
    visa_requirement: Optional[str] = None
    url: str = Field(index=True, unique=True)
    apply_url: Optional[str] = None
    company_url: Optional[str] = None
    external_job_id: Optional[str] = Field(default=None, index=True)
    source_website: str = Field(default="unknown")
    posted_date: Optional[datetime] = None
    closing_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    applications: list["Application"] = Relationship(back_populates="job_post")


class Application(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id", "job_post_id", name="uq_application_user_job"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    job_post_id: int = Field(foreign_key="jobpost.id", index=True)
    status: str = Field(default="Saved", index=True)
    saved_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    match_score: Optional[float] = Field(default=None, index=True)

    user: User = Relationship(back_populates="applications")
    job_post: JobPost = Relationship(back_populates="applications")
    match_results: list["MatchResult"] = Relationship(
        back_populates="application",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    notes: list["ApplicationNote"] = Relationship(
        back_populates="application",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    events: list["ApplicationEvent"] = Relationship(
        back_populates="application",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class Resume(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    filename: str
    stored_path: str
    extracted_text: str = Field(default="")
    created_at: datetime = Field(default_factory=utc_now)

    user: User = Relationship(back_populates="resumes")
    optimizations: list["CvOptimization"] = Relationship(
        back_populates="resume",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class CvOptimization(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    resume_id: int = Field(foreign_key="resume.id", index=True)
    application_id: int = Field(foreign_key="application.id", index=True)
    title: str = Field(default="Optimized CV")
    match_score: float = Field(default=0)
    suggestions: list[dict[str, Any]] = Field(sa_column=Column(JSON), default_factory=list)
    optimized_text: str = Field(default="")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    resume: Resume = Relationship(back_populates="optimizations")


class MatchResult(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    application_id: int = Field(foreign_key="application.id", index=True)
    score: float = Field(default=0)
    payload: dict[str, Any] = Field(sa_column=Column(JSON), default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)

    application: Application = Relationship(back_populates="match_results")


class ApplicationNote(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    application_id: int = Field(foreign_key="application.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    content: str
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    application: Application = Relationship(back_populates="notes")


class ApplicationEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    application_id: Optional[int] = Field(default=None, foreign_key="application.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    event_type: str = Field(index=True)
    source: str = Field(default="extension", index=True)
    page_url: Optional[str] = Field(default=None, max_length=4096)
    status_after: Optional[str] = Field(default=None, index=True)
    occurred_at: datetime = Field(default_factory=utc_now, index=True)
    payload: dict[str, Any] = Field(sa_column=Column(JSON), default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)

    application: Optional[Application] = Relationship(back_populates="events")


# Gmail Add-on message analysis; only the open message's preview and decision are retained.
class EmailEvent(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("user_id", "provider", "external_id", name="uq_email_event_provider_message"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    application_id: Optional[int] = Field(default=None, foreign_key="application.id", index=True)
    external_id: str = Field(default="", index=True)
    provider: str = Field(default="gmail", index=True)
    thread_id: str = Field(default="", index=True)
    sender: str = ""
    subject: str = ""
    body_preview: str = ""
    received_at: Optional[datetime] = None
    parsed_status: Optional[str] = None
    confidence: Optional[float] = None
    sync_state: str = Field(default="pending", index=True)
    created_at: datetime = Field(default_factory=utc_now)


# Legacy table retained so older deployments can delete any pre-Add-on OAuth records safely.
class EmailConnection(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id", "provider", name="uq_email_connection_user_provider"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    provider: str = Field(default="gmail", index=True)
    email_address: str = Field(default="")
    encrypted_refresh_token: str
    granted_scopes: str = Field(default="")
    history_id: Optional[str] = None
    connected_at: datetime = Field(default_factory=utc_now)
    last_synced_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class Notification(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    channel: str = Field(default="in_app", index=True)
    title: str = ""
    body: str = ""
    read: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utc_now)
