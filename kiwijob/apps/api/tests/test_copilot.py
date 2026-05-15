from fastapi.testclient import TestClient

from app.main import app


def test_copilot_answer_uses_profile_fallback() -> None:
    headers = {"X-Mock-User-Id": "42"}

    profile = {
        "fullName": "Ada Lovelace",
        "email": "ada@example.com",
        "phone": "+64 21 123 456",
        "linkedInUrl": "https://linkedin.com/in/ada",
        "portfolioUrl": "https://ada.example.com",
        "githubUrl": "https://github.com/ada",
        "city": "Auckland",
        "country": "New Zealand",
        "workAuthorization": "Yes, I am authorized to work in New Zealand.",
        "sponsorship": "No",
        "salaryExpectation": "NZD 120,000",
        "noticePeriod": "2 weeks",
        "skills": "Python, TypeScript, SQL",
        "summary": "Product-minded software engineer.",
        "coverLetter": "I build reliable software for real users.",
    }
    with TestClient(app) as client:
        res = client.put("/me/applicant-profile", json=profile, headers=headers)
        assert res.status_code == 200

        res = client.post(
            "/copilot/answer",
            json={"question": "What are your salary expectations?"},
            headers=headers,
        )
    assert res.status_code == 200
    body = res.json()
    assert body["answer"] == "NZD 120,000"
    assert body["source"] in {"fallback", "ai"}
    assert "salaryExpectation" in body["used_profile_fields"]


def test_copilot_autofill_plan_returns_field_answers() -> None:
    headers = {"X-Mock-User-Id": "43"}
    with TestClient(app) as client:
        client.put(
            "/me/applicant-profile",
            json={"email": "candidate@example.com", "workAuthorization": "Yes"},
            headers=headers,
        )

        res = client.post(
            "/copilot/autofill-plan",
            json={
                "fields": [
                    {"key": "email", "label": "Email address", "field_type": "email"},
                    {"key": "work", "label": "Are you authorized to work here?", "field_type": "text"},
                ]
            },
            headers=headers,
        )
    assert res.status_code == 200
    answers = {item["key"]: item["answer"] for item in res.json()["answers"]}
    assert answers["email"] == "candidate@example.com"
    assert answers["work"] == "Yes"


def test_copilot_cover_letter_fallback() -> None:
    headers = {"X-Mock-User-Id": "44"}
    with TestClient(app) as client:
        client.put(
            "/me/applicant-profile",
            json={"summary": "I enjoy building useful data products."},
            headers=headers,
        )

        res = client.post("/copilot/cover-letter", json={}, headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert "I enjoy building useful data products." in body["cover_letter"]
    assert body["source"] in {"fallback", "ai"}
