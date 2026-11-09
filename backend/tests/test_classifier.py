import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from scripts.train_classifier import CATEGORIES, validate_dataset
from services import classifier


class DatasetValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.valid_dataset = pd.DataFrame(
            {
                "complaint_text": [
                    "My employer has withheld my salary.",
                    "My landlord has not returned the deposit.",
                    "The shop refused to refund a defective appliance.",
                    "My workplace reduced my wages without explanation.",
                    "The owner ignores repeated repair requests.",
                    "A repair service did not complete the paid work.",
                ],
                "category": [
                    "employment",
                    "rental_property",
                    "consumer",
                    "employment",
                    "rental_property",
                    "consumer",
                ],
            }
        )

    def test_accepts_valid_dataset(self) -> None:
        validated = validate_dataset(self.valid_dataset)
        self.assertEqual(len(validated), 6)

    def test_rejects_missing_values(self) -> None:
        dataset = self.valid_dataset.copy()
        dataset.loc[0, "complaint_text"] = None
        with self.assertRaisesRegex(ValueError, "missing"):
            validate_dataset(dataset)

    def test_rejects_invalid_category(self) -> None:
        dataset = self.valid_dataset.copy()
        dataset.loc[0, "category"] = "housing"
        with self.assertRaisesRegex(ValueError, "invalid categories"):
            validate_dataset(dataset)

    def test_rejects_duplicate_complaint_text(self) -> None:
        dataset = self.valid_dataset.copy()
        dataset.loc[1, "complaint_text"] = dataset.loc[0, "complaint_text"].upper()
        with self.assertRaisesRegex(ValueError, "duplicate"):
            validate_dataset(dataset)


class ClassifierTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.model_path = Path(self.temp_dir.name) / "issue_classifier.joblib"
        examples = [
            ("employer withheld salary wages workplace", "employment"),
            ("workplace employer unpaid salary", "employment"),
            ("landlord rental tenant deposit repairs", "rental_property"),
            ("tenant landlord apartment rent repairs", "rental_property"),
            ("consumer defective product refund purchase", "consumer"),
            ("shop product service refund consumer", "consumer"),
        ]
        model = Pipeline(
            [
                ("tfidf", TfidfVectorizer(ngram_range=(1, 2))),
                ("classifier", LogisticRegression(max_iter=1000, random_state=42)),
            ]
        )
        model.fit(
            [text for text, _ in examples],
            [category for _, category in examples],
        )
        model.uncertainty_threshold_ = 0.0
        joblib.dump(model, self.model_path)
        classifier.load_classifier.cache_clear()
        self.model_path_patch = patch.object(classifier, "MODEL_PATH", self.model_path)
        self.model_path_patch.start()

    def tearDown(self) -> None:
        classifier.load_classifier.cache_clear()
        self.model_path_patch.stop()
        self.temp_dir.cleanup()

    def test_loads_saved_model(self) -> None:
        self.assertIsNotNone(classifier.load_classifier())

    def test_classifies_examples_with_valid_category_and_confidence(self) -> None:
        examples = (
            "My employer has not paid my salary.",
            "My landlord is withholding my rental deposit.",
            "The shop refuses a refund for a defective product.",
        )
        for issue in examples:
            with self.subTest(issue=issue):
                result = classifier.classify_issue(issue)
                self.assertIn(result.category, CATEGORIES)
                self.assertGreaterEqual(result.confidence, 0.0)
                self.assertLessEqual(result.confidence, 1.0)

    def test_rejects_empty_input(self) -> None:
        with self.assertRaisesRegex(ValueError, "must not be empty"):
            classifier.classify_issue("   ")

    def test_rejects_non_string_input(self) -> None:
        with self.assertRaisesRegex(TypeError, "must be a string"):
            classifier.classify_issue(None)  # type: ignore[arg-type]

    def test_returns_no_category_below_uncertainty_threshold(self) -> None:
        model = classifier.load_classifier()
        model.uncertainty_threshold_ = 1.1

        result = classifier.classify_issue("My landlord has not returned the deposit.")

        self.assertIsNone(result.category)
        self.assertGreaterEqual(result.confidence, 0.0)
        self.assertLessEqual(result.confidence, 1.0)

    def test_rejects_model_artifact_without_threshold(self) -> None:
        model = classifier.load_classifier()
        del model.uncertainty_threshold_

        with self.assertRaisesRegex(RuntimeError, "no valid uncertainty threshold"):
            classifier.classify_issue("A valid complaint.")

    def test_missing_model_has_actionable_error(self) -> None:
        missing_path = self.model_path.with_name("missing.joblib")
        with patch.object(classifier, "MODEL_PATH", missing_path):
            classifier.load_classifier.cache_clear()
            with self.assertRaisesRegex(FileNotFoundError, "train_classifier.py"):
                classifier.load_classifier()


class TrainedModelRegressionTests(unittest.TestCase):
    examples = (
        (
            "I have not received my deposit from my landlord even after 2 months of moving out.",
            "rental_property",
        ),
        (
            "My landlord refuses to return my security deposit after I moved out.",
            "rental_property",
        ),
        (
            "The landlord threatened to evict me after I questioned an extra rent charge.",
            "rental_property",
        ),
        (
            "My landlord refuses to fix a leaking pipe in the rented apartment.",
            "rental_property",
        ),
        ("My employer is withholding my salary for the last month.", "employment"),
        (
            "My employer refuses to pay my final wages after I resigned.",
            "employment",
        ),
        (
            "The seller has not refunded my money after I returned the defective item.",
            "consumer",
        ),
    )

    def setUp(self) -> None:
        classifier.load_classifier.cache_clear()

    def tearDown(self) -> None:
        classifier.load_classifier.cache_clear()

    def test_supported_complaints_are_correct_or_explicitly_uncertain(self) -> None:
        for issue, expected_category in self.examples:
            with self.subTest(issue=issue):
                result = classifier.classify_issue(issue)
                self.assertIn(result.category, (expected_category, None))
                self.assertGreaterEqual(result.confidence, 0.0)
                self.assertLessEqual(result.confidence, 1.0)

    def test_vague_complaint_is_uncertain(self) -> None:
        result = classifier.classify_issue("I have an issue and need help.")

        self.assertIsNone(result.category)


if __name__ == "__main__":
    unittest.main()
