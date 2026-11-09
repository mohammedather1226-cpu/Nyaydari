import argparse
import json
import math
import re
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    precision_score,
    recall_score,
    f1_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_predict, train_test_split
from sklearn.pipeline import Pipeline

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATASET_PATH = PROJECT_ROOT / "data" / "legal_complaints.csv"
MODEL_PATH = PROJECT_ROOT / "models" / "issue_classifier.joblib"
REPORT_PATH = PROJECT_ROOT / "reports" / "classifier_evaluation.json"
CATEGORIES = ("employment", "rental_property", "consumer")
RANDOM_STATE = 42
UNCERTAINTY_TARGET_PRECISION = 0.95
UNCERTAINTY_CV_FOLDS = 5


def validate_dataset(dataset: pd.DataFrame) -> pd.DataFrame:
    required_columns = {"complaint_text", "category"}
    missing_columns = required_columns - set(dataset.columns)
    if missing_columns:
        raise ValueError(f"Dataset is missing columns: {sorted(missing_columns)}")

    validated = dataset.loc[:, ["complaint_text", "category"]].copy()
    if validated.isnull().any().any():
        raise ValueError("Dataset contains missing complaint_text or category values.")

    validated["complaint_text"] = validated["complaint_text"].astype(str).str.strip()
    validated["category"] = validated["category"].astype(str).str.strip()
    if (validated["complaint_text"] == "").any():
        raise ValueError("Dataset contains empty complaint_text values.")
    if (validated["category"] == "").any():
        raise ValueError("Dataset contains empty category values.")

    invalid_categories = sorted(set(validated["category"]) - set(CATEGORIES))
    if invalid_categories:
        raise ValueError(f"Dataset contains invalid categories: {invalid_categories}")

    normalized_text = validated["complaint_text"].map(
        lambda value: re.sub(r"\s+", " ", value).casefold()
    )
    if normalized_text.duplicated().any():
        duplicate = validated.loc[normalized_text.duplicated(), "complaint_text"].iloc[0]
        raise ValueError(f"Dataset contains duplicate complaint text: {duplicate!r}")

    counts = validated["category"].value_counts()
    missing_categories = sorted(set(CATEGORIES) - set(counts.index))
    if missing_categories:
        raise ValueError(f"Dataset is missing categories: {missing_categories}")
    if (counts < 2).any():
        raise ValueError("Each category needs at least two examples for a stratified split.")

    return validated


def build_pipeline() -> Pipeline:
    return Pipeline(
        [
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2))),
            ("classifier", LogisticRegression(max_iter=1000, random_state=RANDOM_STATE)),
        ]
    )


def select_uncertainty_threshold(
    train_texts: pd.Series,
    train_labels: pd.Series,
) -> tuple[float, dict[str, Any]]:
    minimum_class_size = int(train_labels.value_counts().min())
    folds = min(UNCERTAINTY_CV_FOLDS, minimum_class_size)
    if folds < 2:
        raise ValueError("At least two training examples per category are required for threshold validation.")

    cross_validator = StratifiedKFold(
        n_splits=folds,
        shuffle=True,
        random_state=RANDOM_STATE,
    )
    probabilities = cross_val_predict(
        build_pipeline(),
        train_texts,
        train_labels,
        cv=cross_validator,
        method="predict_proba",
    )
    categories = sorted(train_labels.unique())
    predicted_indices = probabilities.argmax(axis=1)
    predicted_categories = [categories[index] for index in predicted_indices]
    maximum_probabilities = probabilities.max(axis=1)
    correct = [
        predicted == actual
        for predicted, actual in zip(predicted_categories, train_labels)
    ]

    threshold: float | None = None
    best_accepted = 0
    for candidate in sorted(set(float(value) for value in maximum_probabilities)):
        accepted = maximum_probabilities >= candidate
        accepted_count = int(accepted.sum())
        selective_precision = (
            sum(is_correct for is_correct, is_accepted in zip(correct, accepted) if is_accepted)
            / accepted_count
            if accepted_count
            else 0.0
        )
        if (
            selective_precision >= UNCERTAINTY_TARGET_PRECISION
            and accepted_count > best_accepted
        ):
            threshold = candidate
            best_accepted = accepted_count

    if threshold is None:
        threshold = math.nextafter(float(maximum_probabilities.max()), math.inf)
    accepted = maximum_probabilities >= threshold
    accepted_count = int(accepted.sum())
    rejected_by_actual_category = {
        category: {
            "examples": int((train_labels == category).sum()),
            "rejected": int(
                sum(
                    1
                    for actual, is_accepted in zip(train_labels, accepted)
                    if actual == category and not is_accepted
                )
            ),
            "rejection_rate": float(
                sum(
                    1
                    for actual, is_accepted in zip(train_labels, accepted)
                    if actual == category and not is_accepted
                )
                / (train_labels == category).sum()
            ),
        }
        for category in CATEGORIES
    }
    validation = {
        "method": (
            f"{folds}-fold stratified cross-validation on the training partition only"
        ),
        "target_selective_precision": UNCERTAINTY_TARGET_PRECISION,
        "threshold": threshold,
        "examples": int(len(train_labels)),
        "accepted": accepted_count,
        "rejected": int(len(train_labels) - accepted_count),
        "coverage": float(accepted.mean()),
        "selective_precision": (
            float(sum(is_correct for is_correct, is_accepted in zip(correct, accepted) if is_accepted) / accepted_count)
            if accepted_count
            else None
        ),
        "rejected_by_actual_category": rejected_by_actual_category,
        "note": (
            "The maximum class probability is a model score, not a calibrated probability. "
            "This threshold is a cautious prototype setting, not a legally validated boundary."
        ),
    }
    return threshold, validation


def train_and_evaluate(
    dataset_path: Path = DATASET_PATH,
    model_path: Path = MODEL_PATH,
    report_path: Path = REPORT_PATH,
) -> dict[str, Any]:
    dataset = validate_dataset(pd.read_csv(dataset_path))
    train_texts, test_texts, train_labels, test_labels = train_test_split(
        dataset["complaint_text"],
        dataset["category"],
        test_size=0.2,
        random_state=RANDOM_STATE,
        stratify=dataset["category"],
    )

    uncertainty_threshold, uncertainty_validation = select_uncertainty_threshold(
        train_texts,
        train_labels,
    )
    model = build_pipeline()
    model.fit(train_texts, train_labels)
    model.uncertainty_threshold_ = uncertainty_threshold
    test_probabilities = model.predict_proba(test_texts)
    predicted_indices = test_probabilities.argmax(axis=1)
    predictions = model.classes_[predicted_indices]
    test_scores = test_probabilities.max(axis=1)
    accepted_test_predictions = test_scores >= uncertainty_threshold
    test_rejections_by_category = {
        category: {
            "examples": int((test_labels == category).sum()),
            "rejected": int(
                sum(
                    1
                    for actual, is_accepted in zip(test_labels, accepted_test_predictions)
                    if actual == category and not is_accepted
                )
            ),
            "rejection_rate": float(
                sum(
                    1
                    for actual, is_accepted in zip(test_labels, accepted_test_predictions)
                    if actual == category and not is_accepted
                )
                / (test_labels == category).sum()
            ),
        }
        for category in CATEGORIES
    }
    accepted_test_count = int(accepted_test_predictions.sum())

    report: dict[str, Any] = {
        "dataset": {
            "path": str(dataset_path),
            "synthetic": True,
            "disclaimer": (
                "All examples are synthetic and created for model development. "
                "They are not legal advice or representative of real complaints."
            ),
            "examples": int(len(dataset)),
            "category_counts": {
                category: int(dataset["category"].value_counts()[category])
                for category in CATEGORIES
            },
        },
        "evaluation": {
            "preliminary": True,
            "disclaimer": (
                "Metrics are preliminary results on a held-out split of synthetic data. "
                "They do not estimate real-world accuracy."
            ),
            "split": {
                "train_examples": int(len(train_texts)),
                "test_examples": int(len(test_texts)),
                "test_size": 0.2,
                "stratified": True,
                "random_state": RANDOM_STATE,
            },
            "uncertainty_validation": uncertainty_validation,
            "uncertainty_test": {
                "threshold_fixed_from_training_only_validation": uncertainty_threshold,
                "examples": int(len(test_labels)),
                "accepted": accepted_test_count,
                "rejected": int(len(test_labels) - accepted_test_count),
                "coverage": float(accepted_test_predictions.mean()),
                "selective_accuracy": (
                    float(
                        sum(
                            predicted == actual
                            for predicted, actual, is_accepted in zip(
                                predictions, test_labels, accepted_test_predictions
                            )
                            if is_accepted
                        )
                        / accepted_test_count
                    )
                    if accepted_test_count
                    else None
                ),
                "rejected_by_actual_category": test_rejections_by_category,
                "note": (
                    "This held-out result evaluates the threshold selected before testing; "
                    "the test set did not participate in threshold selection."
                ),
            },
            "accuracy": float(accuracy_score(test_labels, predictions)),
            "precision_macro": float(
                precision_score(test_labels, predictions, average="macro", zero_division=0)
            ),
            "recall_macro": float(
                recall_score(test_labels, predictions, average="macro", zero_division=0)
            ),
            "f1_macro": float(
                f1_score(test_labels, predictions, average="macro", zero_division=0)
            ),
            "classification_report": classification_report(
                test_labels,
                predictions,
                labels=CATEGORIES,
                output_dict=True,
                zero_division=0,
            ),
            "confusion_matrix": {
                "labels": list(CATEGORIES),
                "values": confusion_matrix(
                    test_labels, predictions, labels=CATEGORIES
                ).tolist(),
            },
        },
    }

    model_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, model_path)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Train and evaluate the complaint classifier.")
    parser.add_argument("--dataset", type=Path, default=DATASET_PATH)
    parser.add_argument("--model-output", type=Path, default=MODEL_PATH)
    parser.add_argument("--report-output", type=Path, default=REPORT_PATH)
    args = parser.parse_args()

    report = train_and_evaluate(args.dataset, args.model_output, args.report_output)
    print(json.dumps(report, indent=2))
    print(f"\nSaved model: {args.model_output}")
    print(f"Saved evaluation report: {args.report_output}")


if __name__ == "__main__":
    main()
