/**
 * Shared contracts between the web app, Chrome extension, and API.
 * Keep fields aligned with FastAPI Pydantic models.
 */
export const APPLICATION_STATUSES = [
    "Saved",
    "Applied",
    "Viewed",
    "Assessment",
    "Interview",
    "Rejected",
    "Offer",
    "Withdrawn",
];
export const EMPTY_APPLICANT_AUTOFILL_PROFILE = {
    fullName: "",
    email: "",
    phone: "",
    linkedInUrl: "",
    portfolioUrl: "",
    city: "",
    country: "",
};
