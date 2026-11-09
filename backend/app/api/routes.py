from fastapi import APIRouter, HTTPException

from app.schemas import AnalyzeRequest, AnalysisResponse
from services.classifier import classify_issue

router = APIRouter()

DOCUMENT_RECOMMENDATIONS = {
    "employment": [
        "Employment agreement or offer letter",
        "Recent payslips or wage records",
        "Work-related notices or communications",
        "Records of hours worked or attendance",
    ],
    "rental_property": [
        "Rental or lease agreement",
        "Rent and security-deposit payment records",
        "Written communications with the landlord or property manager",
        "Repair requests, notices, or property-condition records",
    ],
    "consumer": [
        "Receipt, invoice, or order confirmation",
        "Warranty or service terms",
        "Written communications with the seller or service provider",
        "Photos or records documenting the product or service issue",
    ],
}

CATEGORY_NEXT_STEPS = {
    "employment": [
        "Gather your employment agreement, wage records, and any messages about the payment or resignation.",
        "Write down the dates worked, payments received, and attempts to resolve the issue.",
        "Consider asking the employer or payroll team for a written explanation, and consult a qualified professional or official support service.",
    ],
    "rental_property": [
        "Gather the rental agreement, rent and deposit records, and move-in or move-out communications.",
        "Keep dated photographs, repair requests, notices, and written messages relevant to the tenancy.",
        "Consider asking the landlord or property manager for a written response, and consult a qualified local professional or support service.",
    ],
    "consumer": [
        "Keep the receipt or order confirmation, product or service details, and payment records.",
        "Save your written communications with the seller or service provider and note the steps already taken.",
        "Consider sending a clear written request to the provider and consulting a qualified professional or official consumer-support service.",
    ],
}


@router.post("/analyze", response_model=AnalysisResponse, tags=["analysis"])
async def analyze_issue(payload: AnalyzeRequest) -> AnalysisResponse:
    try:
        classification = classify_issue(payload.issue)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "The complaint classifier model is unavailable. "
                "Train it with `python scripts/train_classifier.py`."
            ),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="The complaint classifier could not complete the analysis.",
        ) from exc

    category = classification.category
    if category not in DOCUMENT_RECOMMENDATIONS:
        return AnalysisResponse(
            success=True,
            originalIssue=payload.issue,
            jurisdiction=payload.jurisdiction,
            category=None,
            confidence=classification.confidence,
            identifiedIssue=(
                "The complaint could not be categorized reliably. Please provide more "
                "details about what happened, who was involved, and the relevant documents."
            ),
            explanation=(
                "The classifier marked this result as uncertain. No category-specific "
                "documents or next steps are provided. Add more details and try again."
            ),
            disclaimer=(
                "NyayaDari provides preliminary legal information, not professional legal "
                "advice. Consult a qualified legal professional about your situation."
            ),
        )

    return AnalysisResponse(
        success=True,
        originalIssue=payload.issue,
        jurisdiction=payload.jurisdiction,
        category=category,
        confidence=classification.confidence,
        identifiedIssue=f"Predicted complaint category: {category}.",
        requiredDocuments=DOCUMENT_RECOMMENDATIONS[category],
        nextSteps=CATEGORY_NEXT_STEPS[category],
        explanation=(
            "A machine-learning classifier predicted this category. This is classification "
            "only. Suggested documents are general, preliminary examples, not mandatory "
            "legal requirements. Legal analysis, document review, retrieval-augmented "
            "generation (RAG), and LLM assistance are not implemented."
        ),
        disclaimer=(
            "Automated category classification only; this is not legal advice or a verified "
            "legal assessment. Consult a qualified legal professional about your situation."
        ),
    )
