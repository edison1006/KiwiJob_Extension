from __future__ import annotations

import json
import re
from typing import Any

from openai import OpenAI

from app.core.config import get_settings
from app.schemas import InterviewFeedbackOut, InterviewQuestionOut, InterviewQuestionsOut


TECHNICAL_CATEGORIES = frozenset(
    {
        "software_engineering",
        "data_analytics",
        "cybersecurity_it",
        "cloud_devops",
        "qa_testing",
        "engineering",
        "science_research",
    }
)

TECHNICAL_CATEGORY_QUESTIONS: dict[str, list[tuple[str, str]]] = {
    "software_engineering": [
        ("Design a service for a rapidly growing workload. Explain the architecture, data model, APIs, and failure handling.", "System design"),
        ("How would you diagnose and fix an intermittent performance regression in a production application?", "Debugging and performance"),
        ("Review a change that improves delivery speed but increases coupling. What would you examine before approving it?", "Code quality and trade-offs"),
    ],
    "data_analytics": [
        ("A key business metric suddenly drops by 20%. Walk through the SQL, data-quality, and business checks you would perform.", "Analytical diagnosis"),
        ("How would you design a trustworthy dashboard when stakeholders disagree on metric definitions?", "Metrics and stakeholder alignment"),
        ("Explain how you would validate an analysis and communicate uncertainty before recommending action.", "Validation and communication"),
    ],
    "cybersecurity_it": [
        ("How would you triage a suspected account compromise while preserving evidence and business continuity?", "Incident response"),
        ("Describe how you would assess and prioritise vulnerabilities across a mixed technology environment.", "Risk management"),
        ("Design a practical identity and access approach for a growing organisation.", "Identity and access management"),
    ],
    "cloud_devops": [
        ("Design a highly available deployment pipeline with safe rollback and clear observability.", "Delivery reliability"),
        ("A cloud service is healthy but user latency is rising. How would you isolate the cause?", "Observability and diagnosis"),
        ("How would you reduce cloud cost without weakening reliability or security?", "Cloud architecture trade-offs"),
    ],
    "qa_testing": [
        ("Create a risk-based test strategy for a critical feature with a tight release deadline.", "Test strategy"),
        ("How would you investigate a flaky automated test and decide whether it blocks release?", "Test reliability"),
        ("What should be automated, what should remain exploratory, and how would you measure test effectiveness?", "Quality engineering"),
    ],
    "engineering": [
        ("Walk through how you would translate an ambiguous engineering requirement into a safe, testable design.", "Engineering design"),
        ("How would you investigate a recurring equipment, process, or system failure?", "Root-cause analysis"),
        ("Explain how you balance safety, compliance, cost, maintainability, and delivery time.", "Engineering judgement"),
    ],
    "science_research": [
        ("Design an experiment to test a difficult hypothesis, including controls and sources of bias.", "Experimental design"),
        ("How would you respond when results are statistically significant but operationally questionable?", "Scientific judgement"),
        ("Explain how you would make an analysis reproducible and communicate its limitations.", "Research quality"),
    ],
}


QUESTION_BANK: dict[str, list[tuple[str, str]]] = {
    "behavioral": [
        ("Tell me about a time you had to solve a difficult problem with incomplete information.", "Problem solving"),
        ("Describe a disagreement with a colleague and how you reached a productive outcome.", "Conflict and collaboration"),
        ("Give an example of a time you took ownership beyond your normal responsibilities.", "Ownership"),
        ("Tell me about a mistake you made, how you handled it, and what changed afterwards.", "Learning and accountability"),
        ("Describe a time priorities changed suddenly. How did you respond?", "Adaptability"),
        ("Tell me about a goal you achieved by influencing people without formal authority.", "Influence"),
        ("Describe a time you received difficult feedback and what you did with it.", "Growth mindset"),
        ("Give an example of how you improved a process or customer outcome.", "Continuous improvement"),
        ("Tell me about a time you had to deliver under a tight deadline.", "Prioritisation"),
        ("Why does this role interest you, and what would you aim to contribute first?", "Motivation"),
    ],
    "technical": [
        ("Walk me through a technically challenging project and the key trade-offs you made.", "Technical depth and judgement"),
        ("How would you investigate a production issue that cannot be reproduced locally?", "Debugging"),
        ("Describe how you would design a reliable solution when requirements are still changing.", "System design"),
        ("How do you validate that your work is correct before it reaches users?", "Quality"),
        ("Explain a complex technical concept from your field to a non-technical stakeholder.", "Communication"),
        ("What technical decision would you revisit from a recent project, and why?", "Reflection"),
        ("How do you balance delivery speed, maintainability, security, and cost?", "Engineering trade-offs"),
        ("What metrics would tell you whether a solution is working as intended?", "Measurement"),
        ("How would you approach learning an unfamiliar tool needed for an urgent task?", "Learning agility"),
        ("Which technical trends are most relevant to this role, and how would you evaluate them?", "Domain awareness"),
    ],
    "panel": [
        ("Give us a concise overview of your background and why it fits this role.", "Opening and relevance"),
        ("How would you align stakeholders who have conflicting definitions of success?", "Stakeholder management"),
        ("Describe a decision you made that affected several teams or functions.", "Cross-functional judgement"),
        ("How do you adapt your communication for senior leaders, peers, and delivery teams?", "Audience awareness"),
        ("Tell us about a time you challenged an established approach respectfully.", "Constructive challenge"),
        ("How would you establish credibility during your first 90 days?", "Relationship building"),
        ("Describe a situation where you had to defend a recommendation under scrutiny.", "Executive presence"),
        ("What would your previous collaborators say is your greatest contribution to a team?", "Self-awareness"),
        ("How do you ensure quieter stakeholders are included in a decision?", "Inclusive collaboration"),
        ("What questions would you ask this panel before deciding whether the role is right for you?", "Mutual fit"),
    ],
    "case": [
        ("Clarify the objective, users, constraints, and success measures for this assignment.", "Problem framing"),
        ("What assumptions are you making, and how would you test the riskiest one first?", "Assumption testing"),
        ("Break the problem into a clear set of workstreams and explain your prioritisation.", "Structured thinking"),
        ("What data would you request, and what would you do if it were unavailable?", "Evidence and ambiguity"),
        ("Compare at least two possible approaches and recommend one with explicit trade-offs.", "Decision quality"),
        ("Define a minimum viable recommendation and a longer-term version.", "Scope management"),
        ("Identify the major implementation risks and how you would mitigate them.", "Delivery planning"),
        ("How would you measure impact after implementation?", "Success measurement"),
        ("Prepare a five-minute executive summary of your recommendation.", "Synthesis"),
        ("What would change your recommendation, and what should happen next?", "Intellectual honesty"),
    ],
}


GUIDANCE: dict[str, list[str]] = {
    "behavioral": ["Use Situation, Task, Action, Result", "Keep the context brief and make your own actions specific", "End with a measurable result or lesson"],
    "technical": ["Clarify assumptions before proposing a solution", "Explain alternatives and trade-offs", "Cover validation, failure modes, and measurement"],
    "panel": ["Lead with the answer, then add concise evidence", "Address the whole panel, not only the person who asked", "Connect your example to cross-functional impact"],
    "case": ["State the objective and assumptions", "Use a clear issue tree or sequence", "Finish with recommendation, risks, measures, and next steps"],
}


def _client() -> OpenAI | None:
    key = get_settings().openai_api_key
    return OpenAI(api_key=key) if key else None


def _role_prefix(role: str) -> str:
    return f"For a {role.strip()} role: " if role.strip() else ""


def _fallback_questions(interview_type: str, occupation_category: str, role: str, count: int) -> InterviewQuestionsOut:
    if interview_type == "technical":
        category_rows = TECHNICAL_CATEGORY_QUESTIONS.get(occupation_category, [])
        rows = (category_rows + QUESTION_BANK[interview_type])[:count]
    else:
        rows = QUESTION_BANK[interview_type][:count]
    return InterviewQuestionsOut(
        questions=[
            InterviewQuestionOut(
                question=f"{_role_prefix(role)}{question}" if role and index < 2 else question,
                focus=focus,
                guidance=GUIDANCE[interview_type],
            )
            for index, (question, focus) in enumerate(rows)
        ],
        source="fallback",
        warnings=["AI was unavailable, so KiwiJob used its structured interview question bank."],
    )


def generate_interview_questions(
    *, interview_type: str, occupation_category: str, role: str, company: str, job_description: str, difficulty: str, count: int
) -> InterviewQuestionsOut:
    fallback = _fallback_questions(interview_type, occupation_category, role, count)
    client = _client()
    if client is None:
        return fallback
    prompt = {
        "interview_type": interview_type,
        "occupation_category": occupation_category,
        "role": role,
        "company": company,
        "job_description": job_description[:12000],
        "difficulty": difficulty,
        "question_count": count,
    }
    try:
        response = client.chat.completions.create(
            model=get_settings().openai_model,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You create realistic interview practice sessions. Use only the supplied role and job description; do not invent "
                        "company facts. Return JSON with a questions array. Each item must contain question, focus, and guidance (an array "
                        "of 2-4 short coaching prompts). Make questions distinct, practical, and appropriate to the requested format. "
                        "For technical interviews, ask domain-specific technical questions only and use the supplied technical occupation category."
                    ),
                },
                {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
            ],
            max_tokens=get_settings().openai_copilot_max_output_tokens,
            temperature=0.45,
        )
        data = json.loads(response.choices[0].message.content or "{}")
        questions = [InterviewQuestionOut.model_validate(item) for item in data.get("questions", [])[:count]]
        if len(questions) < 3:
            return fallback
        return InterviewQuestionsOut(questions=questions, source="ai")
    except Exception:  # noqa: BLE001
        return fallback


def _fallback_feedback(interview_type: str, answer: str) -> InterviewFeedbackOut:
    words = re.findall(r"\b[\w'-]+\b", answer)
    lower = answer.lower()
    evidence_markers = ("for example", "specifically", "i did", "i decided", "i created", "i led", "i analysed")
    result_markers = ("result", "outcome", "increased", "reduced", "improved", "saved", "%", "learned")
    structure_markers = {
        "behavioral": ("situation", "task", "action", "result"),
        "technical": ("assumption", "trade-off", "test", "monitor", "risk"),
        "panel": ("first", "because", "example", "result", "stakeholder"),
        "case": ("objective", "assumption", "option", "recommend", "risk", "measure"),
    }[interview_type]
    score = 30
    score += min(25, len(words) // 6)
    score += 15 if any(marker in lower for marker in evidence_markers) else 0
    score += 15 if any(marker in lower for marker in result_markers) else 0
    score += min(15, sum(marker in lower for marker in structure_markers) * 4)
    score = min(92, score)
    strengths: list[str] = []
    improvements: list[str] = []
    if len(words) >= 80:
        strengths.append("The answer includes enough detail to show your reasoning.")
    else:
        improvements.append("Add one concrete example with enough context to make your contribution credible.")
    if any(marker in lower for marker in evidence_markers):
        strengths.append("You describe specific actions rather than relying only on general claims.")
    else:
        improvements.append("Replace general statements with what you personally did, decided, or communicated.")
    if any(marker in lower for marker in result_markers):
        strengths.append("The answer communicates an outcome or lesson.")
    else:
        improvements.append("Close with the result, evidence of impact, and what you learned.")
    if len(words) > 350:
        improvements.append("Tighten the answer so the main point is clear within roughly two minutes.")
    return InterviewFeedbackOut(
        score=score,
        summary="A solid starting point. Strengthen it with clearer evidence, personal actions, and a concise outcome." if score >= 60 else "The core idea is present, but the answer needs a clearer structure and more specific evidence.",
        strengths=strengths or ["You have started answering the question directly."],
        improvements=improvements or ["Make the link to the target role explicit in the final sentence."],
        suggested_structure=GUIDANCE[interview_type],
        source="fallback",
        warnings=["AI was unavailable, so this feedback uses KiwiJob's structure and evidence checks."],
    )


def evaluate_interview_answer(
    *, interview_type: str, occupation_category: str, role: str, question: str, answer: str
) -> InterviewFeedbackOut:
    fallback = _fallback_feedback(interview_type, answer)
    client = _client()
    if client is None:
        return fallback
    payload: dict[str, Any] = {
        "interview_type": interview_type,
        "occupation_category": occupation_category,
        "role": role,
        "question": question,
        "answer": answer,
    }
    try:
        response = client.chat.completions.create(
            model=get_settings().openai_model,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a candid, constructive interview coach. Evaluate only the supplied answer. Return JSON with score (0-100), "
                        "summary, strengths, improvements, and suggested_structure. The last three fields are arrays of concise strings. "
                        "Do not invent candidate experience or rewrite the answer as if facts were known."
                    ),
                },
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            max_tokens=get_settings().openai_copilot_max_output_tokens,
            temperature=0.25,
        )
        data = json.loads(response.choices[0].message.content or "{}")
        return InterviewFeedbackOut(
            score=max(0, min(100, int(data.get("score", fallback.score)))),
            summary=str(data.get("summary") or fallback.summary)[:2000],
            strengths=[str(item) for item in data.get("strengths", [])][:6] or fallback.strengths,
            improvements=[str(item) for item in data.get("improvements", [])][:6] or fallback.improvements,
            suggested_structure=[str(item) for item in data.get("suggested_structure", [])][:6] or fallback.suggested_structure,
            source="ai",
        )
    except Exception:  # noqa: BLE001
        return fallback
