from functools import lru_cache
import math
from pathlib import Path
from typing import NamedTuple

import joblib

MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "issue_classifier.joblib"


class Classification(NamedTuple):
    category: str | None
    confidence: float


@lru_cache(maxsize=1)
def load_classifier():
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(
            f"Classifier model not found at {MODEL_PATH}. "
            "Train it with `python scripts/train_classifier.py` from the backend directory."
        )
    return joblib.load(MODEL_PATH)


def classify_issue(issue: str) -> Classification:
    if not isinstance(issue, str):
        raise TypeError("issue must be a string.")

    complaint = issue.strip()
    if not complaint:
        raise ValueError("issue must not be empty.")

    classifier = load_classifier()
    probabilities = classifier.predict_proba([complaint])[0]
    predicted_index = int(probabilities.argmax())
    score = float(probabilities[predicted_index])
    # Training selects this from training-only OOF predictions; it is not a
    # legally validated confidence boundary.
    threshold = getattr(classifier, "uncertainty_threshold_", None)
    if not isinstance(threshold, (int, float)) or not math.isfinite(threshold):
        raise RuntimeError(
            "The classifier artifact has no valid uncertainty threshold. "
            "Retrain it with `python scripts/train_classifier.py`."
        )

    return Classification(
        category=(
            str(classifier.classes_[predicted_index])
            if score >= threshold
            else None
        ),
        confidence=score,
    )
