from __future__ import annotations


JOB_CLASSIFICATION_TERMS: dict[str, tuple[str, ...]] = {
    "Accounting": ("accountant", "accounting", "audit", "bookkeeper", "payroll"),
    "Administration & Office Support": ("administrator", "administration", "office support", "receptionist", "personal assistant"),
    "Advertising, Arts & Media": ("advertising", "artist", "content producer", "editor", "media"),
    "Banking & Financial Services": ("banking", "financial adviser", "investment", "lending", "wealth"),
    "Call Centre & Customer Service": ("call centre", "contact centre", "customer service", "customer support"),
    "Community Services & Development": ("community", "social worker", "support worker", "youth worker"),
    "Construction": ("construction", "quantity surveyor", "site manager", "foreperson"),
    "Consulting & Strategy": ("consultant", "consulting", "strategy", "strategic"),
    "Design & Architecture": ("architect", "architecture", "designer", "design"),
    "Education & Training": ("teacher", "teaching", "education", "trainer", "tutor"),
    "Engineering": ("engineer", "engineering"),
    "Farming, Animals & Conservation": ("farm", "farming", "veterinary", "animal", "conservation"),
    "Government & Defence": ("government", "defence", "policy adviser", "public sector"),
    "Healthcare & Medical": ("healthcare", "medical", "nurse", "doctor", "clinical", "pharmacist"),
    "Hospitality & Tourism": ("hospitality", "tourism", "chef", "restaurant", "hotel"),
    "Human Resources & Recruitment": ("human resources", "recruiter", "recruitment", "people and culture"),
    "Information & Communication Technology": ("software", "developer", "data", "technology", "information technology", "cyber", "network engineer"),
    "Insurance & Superannuation": ("insurance", "underwriter", "claims", "superannuation"),
    "Legal": ("lawyer", "legal", "solicitor", "paralegal"),
    "Manufacturing, Transport & Logistics": ("manufacturing", "logistics", "warehouse", "driver", "transport", "supply chain"),
    "Marketing & Communications": ("marketing", "communications", "brand", "public relations"),
    "Mining, Resources & Energy": ("mining", "energy", "oil", "gas", "resources"),
    "Real Estate & Property": ("real estate", "property", "facilities manager", "property manager"),
    "Retail & Consumer Products": ("retail", "store manager", "merchandiser", "consumer products"),
    "Sales": ("sales", "account executive", "business development"),
    "Science & Technology": ("scientist", "science", "laboratory", "researcher"),
    "Sport & Recreation": ("sport", "recreation", "fitness", "coach"),
    "Trades & Services": ("electrician", "plumber", "mechanic", "technician", "tradesperson"),
}


def classification_terms(classification: str) -> tuple[str, ...]:
    return JOB_CLASSIFICATION_TERMS.get(classification.strip(), ())


def matches_classification(classification: str, *values: str | None) -> bool:
    selected = classification.strip().lower()
    if not selected:
        return True
    text = " ".join(value or "" for value in values).lower()
    if selected in text:
        return True
    return any(term in text for term in classification_terms(classification))
