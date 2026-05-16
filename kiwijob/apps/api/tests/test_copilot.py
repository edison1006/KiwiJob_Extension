from fastapi.testclient import TestClient

from app.db.session import get_engine
from app.main import app
from app.models import Application, Resume
from conftest import auth_headers
from sqlmodel import Session, select


def test_copilot_answer_uses_profile_fallback() -> None:
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
        headers, _ = auth_headers(client)
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
    with TestClient(app) as client:
        headers, _ = auth_headers(client)
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
    with TestClient(app) as client:
        headers, _ = auth_headers(client)
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


def test_latest_resume_profile_returns_uploaded_cv_fields() -> None:
    text = (
        "Edison Zhang\n"
        "edison@example.com\n\n"
        "Education\n"
        "York College\n"
        "Master's, Software Engineering\n"
        "2025 - 2026\n\n"
        "Skills\n"
        "Python SQL Power BI AWS\n\n"
        "Languages\n"
        "English\n"
    )
    with TestClient(app) as client:
        headers, user_id = auth_headers(client)
        with Session(get_engine()) as session:
            session.add(Resume(user_id=user_id, filename="resume.pdf", stored_path="/tmp/resume.pdf", extracted_text=text))
            session.commit()
        res = client.get("/resumes/profile", headers=headers)

    assert res.status_code == 200
    body = res.json()
    assert body["email"] == "edison@example.com"
    assert body["education"][0]["school"] == "York College"
    assert "Python" in body["skills"]
    assert body["upload"]["filename"] == "resume.pdf"
    assert isinstance(body["upload"]["id"], int)


def test_resume_profile_detects_common_section_heading_variants() -> None:
    text = (
        "Edison Zhang\n"
        "edison@example.com\n\n"
        "Professional Summary\n"
        "Data analyst focused on useful data products.\n\n"
        "Education & Qualifications\n"
        "University of Auckland\n"
        "Bachelor of Commerce\n"
        "2020 - 2023\n\n"
        "Professional Experience\n"
        "Data Analyst\n"
        "Acme Ltd\n"
        "2023 - present\n\n"
        "Skills\n"
        "SQL Power BI\n\n"
        "Certifications\n"
        "Microsoft Power BI Data Analyst\n"
    )
    with TestClient(app) as client:
        headers, user_id = auth_headers(client)
        with Session(get_engine()) as session:
            session.add(Resume(user_id=user_id, filename="variant-resume.pdf", stored_path="/tmp/variant-resume.pdf", extracted_text=text))
            session.commit()
        res = client.get("/resumes/profile", headers=headers)

    assert res.status_code == 200
    body = res.json()
    assert body["summary"] == "Data analyst focused on useful data products."
    assert body["education"][0]["school"] == "University of Auckland"
    assert body["experience"][0]["title"] == "Data Analyst"
    assert body["certifications"] == ["Microsoft Power BI Data Analyst"]


def test_resume_profile_uses_filename_name_before_email_fallback() -> None:
    text = (
        "edisonzhang0321@gmail.com\n\n"
        "Skills\n"
        "SQL Power BI\n"
    )
    with TestClient(app) as client:
        headers, user_id = auth_headers(client)
        with Session(get_engine()) as session:
            session.add(
                Resume(
                    user_id=user_id,
                    filename="Edison(Xiaoyu)_Zhang_Resume.pdf",
                    stored_path="/tmp/edison-resume.pdf",
                    extracted_text=text,
                )
            )
            session.commit()
        res = client.get("/resumes/profile", headers=headers)

    assert res.status_code == 200
    assert res.json()["full_name"] == "Edison Xiaoyu Zhang"


def test_resume_delete_removes_selected_cv() -> None:
    with TestClient(app) as client:
        headers, user_id = auth_headers(client)
        with Session(get_engine()) as session:
            row = Resume(user_id=user_id, filename="delete-me.pdf", stored_path="/tmp/kiwijob-delete-me.pdf", extracted_text="Delete Me\nme@example.com")
            session.add(row)
            session.commit()
            session.refresh(row)
            resume_id = row.id

        assert resume_id is not None
        delete = client.delete(f"/resumes/{resume_id}", headers=headers)
        after = client.get("/resumes", headers=headers)

    assert delete.status_code == 204
    assert after.status_code == 200
    assert all(item["id"] != resume_id for item in after.json())


def test_match_preview_does_not_create_application() -> None:
    with TestClient(app) as client:
        headers, user_id = auth_headers(client)
        with Session(get_engine()) as session:
            session.add(Resume(user_id=user_id, filename="preview.pdf", stored_path="/tmp/preview.pdf", extracted_text="Python SQL AWS"))
            session.commit()
        res = client.post(
            "/match/preview",
            headers=headers,
            json={
                "title": "Data Analyst",
                "description": "Python SQL dashboard role",
                "url": "https://example.com/jobs/preview",
                "source_website": "example.com",
                "status": "Saved",
            },
        )

    assert res.status_code == 200
    with Session(get_engine()) as session:
        rows = session.exec(select(Application).where(Application.user_id == user_id)).all()
    assert rows == []
