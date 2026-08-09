from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

APPLICATION_STATUSES = frozenset(
    {
        "Saved",
        "Applied",
        "Assessment",
        "Reply",
        "Interview",
        "Rejected",
        "Offer",
        "Withdrawn",
    }
)


class UserOut(BaseModel):
    id: int
    email: str
    display_name: str = ""
    membership_tier: str = "free"
    membership_expires_at: Optional[datetime] = None


class AuthIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=8, max_length=200)
    display_name: str = Field(default="", max_length=200)


class AccountIdentifyIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)


class AccountIdentifyOut(BaseModel):
    account_exists: bool
    password_login_available: bool
    auth_provider: Optional[str] = None


class AuthOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class OAuthIn(BaseModel):
    provider: str = Field(..., pattern="^(google|apple)$")
    id_token: str = Field(..., min_length=20)


class PasswordChangeIn(BaseModel):
    current_password: str = Field(..., min_length=8, max_length=200)
    new_password: str = Field(..., min_length=8, max_length=200)


class JobSaveIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    company: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    salary: Optional[str] = None
    employment_type: Optional[str] = Field(default=None, max_length=500)
    workplace_type: Optional[str] = Field(default=None, max_length=500)
    visa_requirement: Optional[str] = Field(default=None, max_length=1000)
    url: str = Field(..., min_length=4, max_length=4096)
    apply_url: Optional[str] = Field(default=None, max_length=4096)
    company_url: Optional[str] = Field(default=None, max_length=4096)
    external_job_id: Optional[str] = Field(default=None, max_length=500)
    source_website: str = Field(default="unknown", max_length=200)
    posted_date: Optional[datetime] = None
    closing_date: Optional[datetime] = None
    status: str = Field(default="Saved")

    def normalized_status(self) -> str:
        s = self.status.strip()
        if s not in APPLICATION_STATUSES:
            return "Saved"
        return s


class JobExtractIn(BaseModel):
    url: str = Field(..., min_length=4, max_length=4096)


class JobSearchIn(BaseModel):
    keywords: str = Field(default="", max_length=200)
    location: str = Field(default="All New Zealand", max_length=200)
    job_type: str = Field(default="", max_length=50)
    min_salary: str = Field(default="", max_length=20)
    sources: list[str] = Field(default_factory=lambda: ["seek"])


class JobSearchResultOut(BaseModel):
    source_id: str
    source_name: str
    search_url: str
    job: JobSaveIn
    company_logo_url: Optional[str] = None


class JobPostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    company: Optional[str]
    location: Optional[str]
    description: Optional[str]
    salary: Optional[str]
    employment_type: Optional[str]
    workplace_type: Optional[str]
    visa_requirement: Optional[str]
    url: str
    apply_url: Optional[str]
    company_url: Optional[str]
    external_job_id: Optional[str]
    source_website: str
    posted_date: Optional[datetime]
    closing_date: Optional[datetime]
    created_at: datetime
    updated_at: datetime

class ApplicationListOut(BaseModel):
    id: int
    status: str
    saved_at: datetime
    updated_at: datetime
    match_score: Optional[float]
    job: JobPostOut


class ApplicationNoteIn(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)


class ApplicationNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: int
    content: str
    created_at: datetime
    updated_at: datetime
    is_edited: bool = False

class ApplicationTimelineEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_type: str
    source: str
    page_url: Optional[str]
    status_after: Optional[str]
    occurred_at: datetime
    created_at: datetime

class ApplicationDetailOut(ApplicationListOut):
    latest_match: Optional[dict[str, Any]] = None
    notes: list[ApplicationNoteOut] = Field(default_factory=list)
    timeline: list[ApplicationTimelineEventOut] = Field(default_factory=list)


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
            "application_started": "Applied",
            "application_submitted": "Applied",
            "email_reply": "Reply",
            "reply_detected": "Reply",
            "assessment_detected": "Assessment",
            "interview_detected": "Interview",
            "offer_detected": "Offer",
            "rejection_detected": "Rejected",
            "withdrawn_detected": "Withdrawn",
            "email_interview": "Interview",
            "email_assessment": "Assessment",
            "email_reply_detected": "Reply",
            "email_offer": "Offer",
            "email_rejection": "Rejected",
        }
        return mapped.get(self.event_type.strip().lower())


class ApplicationEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    application_id: Optional[int]
    event_type: str
    source: str
    page_url: Optional[str]
    status_after: Optional[str]
    occurred_at: datetime
    created_at: datetime

class ApplicationEventTrackOut(BaseModel):
    event: ApplicationEventOut
    application: Optional[ApplicationListOut] = None


class GmailIntegrationStatusOut(BaseModel):
    configured: bool
    connected: bool
    prompt_required: bool
    email_address: Optional[str] = None
    last_synced_at: Optional[datetime] = None


class GmailLinkIn(BaseModel):
    id_token: str = Field(..., min_length=20)


class DuplicateApplicationCheckIn(BaseModel):
    company: str = Field(..., min_length=1, max_length=500)
    title: str = Field(..., min_length=1, max_length=500)


class DuplicateApplicationOut(BaseModel):
    duplicate: bool
    applications: list[ApplicationListOut] = Field(default_factory=list)


class ApplicationUpdateIn(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    company: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    salary: Optional[str] = None
    employment_type: Optional[str] = Field(default=None, max_length=500)
    workplace_type: Optional[str] = Field(default=None, max_length=500)
    visa_requirement: Optional[str] = Field(default=None, max_length=1000)
    url: Optional[str] = Field(default=None, min_length=4, max_length=4096)
    apply_url: Optional[str] = Field(default=None, max_length=4096)
    company_url: Optional[str] = Field(default=None, max_length=4096)
    external_job_id: Optional[str] = Field(default=None, max_length=500)
    source_website: Optional[str] = Field(default=None, max_length=200)
    posted_date: Optional[datetime] = None
    closing_date: Optional[datetime] = None

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


class CvOptimizationCreateIn(BaseModel):
    application_id: int
    resume_id: int


class CvOptimizationSuggestionOut(BaseModel):
    id: str
    section: str
    original: str = ""
    suggested: str
    reason: str = ""
    accepted: bool = True


class CvOptimizationUpdateIn(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    optimized_text: Optional[str] = Field(default=None, max_length=100000)
    suggestions: Optional[list[CvOptimizationSuggestionOut]] = None


class CvOptimizationOut(BaseModel):
    id: int
    application_id: int
    resume_id: int
    title: str
    match_score: float
    suggestions: list[CvOptimizationSuggestionOut] = Field(default_factory=list)
    optimized_text: str
    created_at: datetime
    updated_at: datetime


class ResumeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    created_at: datetime
    text_preview: str

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
    summary: str = ""
    education: list[CvProfileEducationOut] = Field(default_factory=list)
    experience: list[CvProfileExperienceOut] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
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
    resume_id: Optional[int] = Field(default=None, description="Optional resume id used as applicant context")
    tone: str = Field(default="concise and professional", max_length=200)
    extra_instructions: str = Field(default="", max_length=2000)


class CopilotCoverLetterOut(BaseModel):
    cover_letter: str
    source: str = "fallback"
    warnings: list[str] = Field(default_factory=list)


class InterviewQuestionOut(BaseModel):
    question: str
    focus: str = ""
    guidance: list[str] = Field(default_factory=list)


class InterviewQuestionsIn(BaseModel):
    interview_type: str = Field(..., pattern="^(behavioral|technical|panel|case)$")
    occupation_category: str = Field(default="general", pattern="^[a-z_]+$", max_length=80)
    role: str = Field(default="", max_length=300)
    company: str = Field(default="", max_length=300)
    job_description: str = Field(default="", max_length=16000)
    difficulty: str = Field(default="medium", pattern="^(easy|medium|hard)$")
    question_count: int = Field(default=5, ge=3, le=10)


class InterviewQuestionsOut(BaseModel):
    questions: list[InterviewQuestionOut]
    source: str = Field(description="ai or fallback")
    warnings: list[str] = Field(default_factory=list)


class InterviewFeedbackIn(BaseModel):
    interview_type: str = Field(..., pattern="^(behavioral|technical|panel|case)$")
    occupation_category: str = Field(default="general", pattern="^[a-z_]+$", max_length=80)
    role: str = Field(default="", max_length=300)
    question: str = Field(..., min_length=1, max_length=4000)
    answer: str = Field(..., min_length=1, max_length=16000)


class InterviewFeedbackOut(BaseModel):
    score: int = Field(ge=0, le=100)
    summary: str
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    suggested_structure: list[str] = Field(default_factory=list)
    source: str = Field(description="ai or fallback")
    warnings: list[str] = Field(default_factory=list)


class ForumAuthorOut(BaseModel):
    id: int
    display_name: str


class ForumPostCreateIn(BaseModel):
    category: str = Field(..., pattern="^(job_search|interviews|cv_cover_letter|career_change|workplace|visa_nz|success_story|general)$")
    title: str = Field(..., min_length=5, max_length=300)
    # Rich-text markup adds bytes around the user-visible 30,000-character limit.
    content: str = Field(..., min_length=20, max_length=100000)
    tags: list[str] = Field(default_factory=list, max_length=5)
    attachment_ids: list[int] = Field(default_factory=list, max_length=10)


class ForumCommentCreateIn(BaseModel):
    content: str = Field(..., min_length=2, max_length=8000)


class ForumCommentOut(BaseModel):
    id: int
    content: str
    author: ForumAuthorOut
    created_at: datetime
    updated_at: datetime
    can_delete: bool = False


class ForumAttachmentOut(BaseModel):
    id: int
    filename: str
    media_type: str
    size_bytes: int
    kind: str


class ForumPostOut(BaseModel):
    id: int
    category: str
    title: str
    content: str
    tags: list[str] = Field(default_factory=list)
    attachments: list[ForumAttachmentOut] = Field(default_factory=list)
    author: ForumAuthorOut
    view_count: int
    like_count: int
    comment_count: int
    liked_by_me: bool = False
    can_delete: bool = False
    created_at: datetime
    updated_at: datetime


class ForumPostDetailOut(ForumPostOut):
    comments: list[ForumCommentOut] = Field(default_factory=list)


class ForumLikeOut(BaseModel):
    liked: bool
    like_count: int


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
