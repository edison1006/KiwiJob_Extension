from app.services.match_ai import _mock_match


def test_mock_match_uses_jd_as_only_matching_standard() -> None:
    result = _mock_match(
        cv="Experienced Python engineer with SQL reporting experience.",
        jd="We need a Data Analyst for SQL dashboards, Power BI reporting, and stakeholder communication.",
    )

    assert "python" not in result["matched_skills"]
    assert "sql" in result["matched_skills"]
    assert "power bi" in result["missing_skills"]
    assert "communication" in result["missing_skills"]
    assert all(term in {"sql", "power bi", "reporting", "stakeholder", "communication", "data analysis", "data analytics"} for term in result["matched_skills"] + result["missing_skills"])


def test_mock_match_hides_visa_status_when_jd_does_not_mention_it() -> None:
    result = _mock_match(
        cv="I hold a valid New Zealand work visa and have Python experience.",
        jd="We need a Data Analyst for SQL dashboards and stakeholder reporting.",
    )

    assert "work authorization" not in result["matched_skills"]
    assert "work authorization" not in result["missing_skills"]


def test_mock_match_checks_visa_status_only_when_jd_mentions_it() -> None:
    result = _mock_match(
        cv="I hold a valid New Zealand work visa and do not require sponsorship.",
        jd="Applicants must have current right to work in New Zealand. SQL reporting is required.",
    )

    assert "work authorization" in result["matched_skills"]
    assert "work authorization" not in result["missing_skills"]
