from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

APPLICATION_STATUSES = frozenset(
    {
        "Saved",
        "Applied",
        "Viewed",
        "Assessment",
        "Interview",
        "Rejected",
        "Offer",
        "Withdrawn",
    }
)


class JobSaveIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    company: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    salary: Optional[str] = None
    url: str = Field(..., min_length=4, max_length=4096)
    source_website: str = Field(default="unknown", max_length=200)
    posted_date: Optional[datetime] = None
    status: str = Field(default="Saved")

    def normalized_status(self) -> str:
        s = self.status.strip()
        if s not in APPLICATION_STATUSES:
            return "Saved"
        return s


class JobPostOut(BaseModel):
    id: int
    title: str
    company: Optional[str]
    location: Optional[str]
    description: Optional[str]
    salary: Optional[str]
    url: str
    source_website: str
    posted_date: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ApplicationListOut(BaseModel):
    id: int
    status: str
    saved_at: datetime
    updated_at: datetime
    match_score: Optional[float]
    job: JobPostOut


class ApplicationDetailOut(ApplicationListOut):
    latest_match: Optional[dict[str, Any]] = None


class ApplicationUpdateIn(BaseModel):
    status: Optional[str] = None

    def normalized_status(self) -> Optional[str]:
        if self.status is None:
            return None
        s = self.status.strip()
        if s not in APPLICATION_STATUSES:
            return None
        return s


class MatchAnalyzeIn(BaseModel):
    job_id: int = Field(..., description="Application (tracker) id")


class MatchAnalysisOut(BaseModel):
    score: float
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    matched_experience: list[str] = Field(default_factory=list)
    missing_experience: list[str] = Field(default_factory=list)
    ats_keywords: list[str] = Field(default_factory=list)
    cv_summary_suggestion: str = ""
    bullet_point_suggestions: list[str] = Field(default_factory=list)
    cover_letter_draft: str = ""
    risk_flags: list[str] = Field(default_factory=list)


class ResumeOut(BaseModel):
    id: int
    filename: str
    created_at: datetime
    text_preview: str

    class Config:
        from_attributes = True


class AnalyticsSummaryOut(BaseModel):
    total_saved: int
    total_applied: int
    interview_count: int
    rejection_count: int
    average_match_score: Optional[float]
    by_source: dict[str, int]
    by_status: dict[str, int]
