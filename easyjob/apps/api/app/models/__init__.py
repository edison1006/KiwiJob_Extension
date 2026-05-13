from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    pass


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(default="demo@easyjob.local", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    applications: list["Application"] = Relationship(back_populates="user")
    resumes: list["Resume"] = Relationship(back_populates="user")


class JobPost(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    company: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    salary: Optional[str] = None
    url: str = Field(index=True, unique=True)
    source_website: str = Field(default="unknown")
    posted_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    applications: list["Application"] = Relationship(back_populates="job_post")


class Application(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id", "job_post_id", name="uq_application_user_job"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    job_post_id: int = Field(foreign_key="jobpost.id", index=True)
    status: str = Field(default="Saved", index=True)
    saved_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    match_score: Optional[float] = Field(default=None, index=True)

    user: User = Relationship(back_populates="applications")
    job_post: JobPost = Relationship(back_populates="applications")
    match_results: list["MatchResult"] = Relationship(
        back_populates="application",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class Resume(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    filename: str
    stored_path: str
    extracted_text: str = Field(default="")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    user: User = Relationship(back_populates="resumes")


class MatchResult(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    application_id: int = Field(foreign_key="application.id", index=True)
    score: float = Field(default=0)
    payload: dict[str, Any] = Field(sa_column=Column(JSON), default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    application: Application = Relationship(back_populates="match_results")


# Stubs for future Gmail / Calendar / monitoring — tables exist but are unused in MVP.
class EmailEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    external_id: str = Field(default="", index=True)
    subject: str = ""
    body_preview: str = ""
    received_at: Optional[datetime] = None
    parsed_status: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Notification(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    channel: str = Field(default="in_app", index=True)
    title: str = ""
    body: str = ""
    read: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
