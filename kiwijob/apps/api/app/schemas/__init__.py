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


class ApplicationEventIn(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=100)
    source: str = Field(default="extension", max_length=100)
    page_url: Optional[str] = Field(default=None, max_length=4096)
    occurred_at: Optional[datetime] = None
    status: Optional[str] = None
    job: Optional[JobSaveIn] = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    def normalized_status(self) -> Optional[str]:
        if self.status:
            s = self.status.strip()
            if s in APPLICATION_STATUSES:
                return s
        mapped = {
            "job_viewed": "Viewed",
            "application_started": "Applied",
            "application_submitted": "Applied",
            "assessment_detected": "Assessment",
            "interview_detected": "Interview",
            "offer_detected": "Offer",
            "rejection_detected": "Rejected",
            "withdrawn_detected": "Withdrawn",
            "email_interview": "Interview",
            "email_offer": "Offer",
            "email_rejection": "Rejected",
        }
        return mapped.get(self.event_type.strip().lower())


class ApplicationEventOut(BaseModel):
    id: int
    application_id: Optional[int]
    event_type: str
    source: str
    page_url: Optional[str]
    status_after: Optional[str]
    occurred_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class ApplicationEventTrackOut(BaseModel):
    event: ApplicationEventOut
    application: Optional[ApplicationListOut] = None


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


class CvProfileEducationOut(BaseModel):
    school: str = ""
    degree: str = ""
    years: str = ""


class CvProfileExperienceOut(BaseModel):
    title: str = ""
    company: str = ""
    years: str = ""


class CvProfileUploadOut(BaseModel):
    id: int
    filename: str
    created_at: datetime


class CvProfileOut(BaseModel):
    full_name: str = ""
    initials: str = ""
    email: str = ""
    phone: str = ""
    education: list[CvProfileEducationOut] = Field(default_factory=list)
    experience: list[CvProfileExperienceOut] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    links: list[str] = Field(default_factory=list)
    upload: Optional[CvProfileUploadOut] = None


class ApplicantAutofillOut(BaseModel):
    fullName: str = ""
    email: str = ""
    phone: str = ""
    linkedInUrl: str = ""
    portfolioUrl: str = ""
    githubUrl: str = ""
    city: str = ""
    country: str = ""
    workAuthorization: str = ""
    sponsorship: str = ""
    salaryExpectation: str = ""
    noticePeriod: str = ""
    skills: str = ""
    summary: str = ""
    coverLetter: str = ""


class ApplicantAutofillIn(BaseModel):
    fullName: str = Field(default="", max_length=500)
    email: str = Field(default="", max_length=500)
    phone: str = Field(default="", max_length=80)
    linkedInUrl: str = Field(default="", max_length=2048)
    portfolioUrl: str = Field(default="", max_length=2048)
    githubUrl: str = Field(default="", max_length=2048)
    city: str = Field(default="", max_length=200)
    country: str = Field(default="", max_length=200)
    workAuthorization: str = Field(default="", max_length=500)
    sponsorship: str = Field(default="", max_length=500)
    salaryExpectation: str = Field(default="", max_length=500)
    noticePeriod: str = Field(default="", max_length=500)
    skills: str = Field(default="", max_length=8000)
    summary: str = Field(default="", max_length=8000)
    coverLetter: str = Field(default="", max_length=20000)


class CopilotQuestionIn(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    field_label: str = Field(default="", max_length=500)
    field_type: str = Field(default="", max_length=80)
    job_id: Optional[int] = Field(default=None, description="Optional application / tracker row id")


class CopilotAnswerOut(BaseModel):
    answer: str
    source: str = Field(description="ai or fallback")
    confidence: float = Field(default=0.5, ge=0, le=1)
    used_profile_fields: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class CopilotAutofillFieldIn(BaseModel):
    key: str = Field(..., min_length=1, max_length=200)
    label: str = Field(default="", max_length=1000)
    field_type: str = Field(default="", max_length=80)
    current_value: str = Field(default="", max_length=4000)


class CopilotAutofillPlanIn(BaseModel):
    fields: list[CopilotAutofillFieldIn] = Field(default_factory=list, max_length=80)
    page_url: str = Field(default="", max_length=4096)
    job_id: Optional[int] = Field(default=None, description="Optional application / tracker row id")


class CopilotFieldAnswerOut(BaseModel):
    key: str
    answer: str
    source: str = "fallback"
    confidence: float = Field(default=0.5, ge=0, le=1)


class CopilotAutofillPlanOut(BaseModel):
    answers: list[CopilotFieldAnswerOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class CopilotCoverLetterIn(BaseModel):
    job_id: Optional[int] = Field(default=None, description="Optional application / tracker row id")
    tone: str = Field(default="concise and professional", max_length=200)
    extra_instructions: str = Field(default="", max_length=2000)


class CopilotCoverLetterOut(BaseModel):
    cover_letter: str
    source: str = "fallback"
    warnings: list[str] = Field(default_factory=list)


class AnalyticsSummaryOut(BaseModel):
    total_saved: int
    total_applied: int
    interview_count: int
    rejection_count: int
    average_match_score: Optional[float]
    by_source: dict[str, int]
    by_status: dict[str, int]


class InsightTitleCountOut(BaseModel):
    title: str
    count: int


class InsightsSummaryOut(BaseModel):
    days: int
    start_date: datetime
    end_date: datetime
    applications: int
    replies: int
    interviews: int
    offers: int
    rejections: int
    response_rate: float
    interview_rate: float
    top_titles: list[InsightTitleCountOut] = Field(default_factory=list)
    by_status: dict[str, int]
