import asyncio
import json
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from app.api.routes import analyze_issue
from app.main import app
from app.schemas import AnalyzeRequest
from services.classifier import Classification


def asgi_request(path: str, payload: dict[str, object]) -> tuple[int, dict[str, object]]:
    body = json.dumps(payload).encode("utf-8")
    response_messages: list[dict[str, object]] = []
    request_sent = False

    async def receive() -> dict[str, object]:
        nonlocal request_sent
        if request_sent:
            return {"type": "http.disconnect"}
        request_sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message: dict[str, object]) -> None:
        response_messages.append(message)

    scope: dict[str, object] = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": b"",
        "root_path": "",
        "headers": [
            (b"host", b"testserver"),
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode("ascii")),
        ],
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    }

    asyncio.run(app(scope, receive, send))
    status = next(
        int(message["status"])
        for message in response_messages
        if message["type"] == "http.response.start"
    )
    response_body = b"".join(
        message.get("body", b"")
        for message in response_messages
        if message["type"] == "http.response.body"
    )
    return status, json.loads(response_body)


class AnalyzeRouteTests(unittest.TestCase):
    def test_passes_complaint_text_to_classifier(self) -> None:
        complaint = "My employer has withheld my salary."
        with patch(
            "app.api.routes.classify_issue",
            return_value=Classification("employment", 0.81),
        ) as classify:
            response = asyncio.run(
                analyze_issue(
                    AnalyzeRequest(issue=complaint, jurisdiction="India, Delhi")
                )
            )

        classify.assert_called_once_with(complaint)
        self.assertEqual(response.originalIssue, complaint)
        self.assertEqual(response.jurisdiction, "India, Delhi")

    def test_returns_predicted_category_and_confidence(self) -> None:
        with patch(
            "app.api.routes.classify_issue",
            return_value=Classification("rental_property", 0.76),
        ):
            response = asyncio.run(
                analyze_issue(AnalyzeRequest(issue="My landlord kept my deposit."))
            )

        self.assertEqual(response.category, "rental_property")
        self.assertEqual(response.confidence, 0.76)
        self.assertIn("Rental or lease agreement", response.requiredDocuments)
        self.assertTrue(response.nextSteps)
        self.assertTrue(response.success)
        self.assertTrue(response.demo)

    def test_does_not_return_fixed_mock_category(self) -> None:
        with patch(
            "app.api.routes.classify_issue",
            return_value=Classification("consumer", 0.68),
        ):
            response = asyncio.run(
                analyze_issue(AnalyzeRequest(issue="The seller refused my refund."))
            )

        self.assertEqual(response.category, "consumer")
        self.assertNotEqual(response.category, "Mock analysis")
        self.assertIn("classification only", response.explanation)
        self.assertIn("not implemented", response.explanation)

    def test_returns_recommendations_for_each_predicted_category(self) -> None:
        expected_first_document = {
            "employment": "Employment agreement or offer letter",
            "rental_property": "Rental or lease agreement",
            "consumer": "Receipt, invoice, or order confirmation",
        }
        for category, first_document in expected_first_document.items():
            with self.subTest(category=category):
                with patch(
                    "app.api.routes.classify_issue",
                    return_value=Classification(category, 0.7),
                ):
                    response = asyncio.run(
                        analyze_issue(AnalyzeRequest(issue="A complaint."))
                    )

                self.assertEqual(response.category, category)
                self.assertIn(first_document, response.requiredDocuments)
                self.assertTrue(response.nextSteps)
                self.assertIn("not mandatory", response.explanation)

    def test_uncertain_prediction_has_no_category_specific_guidance(self) -> None:
        with patch(
            "app.api.routes.classify_issue",
            return_value=Classification(None, 0.34),
        ):
            response = asyncio.run(
                analyze_issue(AnalyzeRequest(issue="A vague complaint."))
            )

        self.assertTrue(response.success)
        self.assertIsNone(response.category)
        self.assertEqual(response.requiredDocuments, [])
        self.assertEqual(response.nextSteps, [])
        self.assertIn("more details", response.identifiedIssue)
        self.assertIn("not professional legal advice", response.disclaimer)

    def test_missing_model_returns_service_unavailable_error(self) -> None:
        with patch(
            "app.api.routes.classify_issue",
            side_effect=FileNotFoundError("missing model"),
        ):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(analyze_issue(AnalyzeRequest(issue="A complaint.")))

        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn("classifier model is unavailable", raised.exception.detail)

    def test_model_loading_failure_returns_server_error(self) -> None:
        with patch(
            "app.api.routes.classify_issue",
            side_effect=ValueError("corrupt model"),
        ):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(analyze_issue(AnalyzeRequest(issue="A complaint.")))

        self.assertEqual(raised.exception.status_code, 500)

    def test_request_schema_rejects_empty_complaint(self) -> None:
        with self.assertRaises(ValidationError):
            AnalyzeRequest(issue="   ")


class AnalyzeApiRegressionTests(unittest.TestCase):
    examples = (
        (
            "I have not received my deposit from my landlord even after 2 months of moving out.",
            "rental_property",
            "Rental or lease agreement",
        ),
        (
            "My landlord refuses to return my security deposit after I moved out.",
            "rental_property",
            "Rental or lease agreement",
        ),
        (
            "The landlord threatened to evict me after I questioned an extra rent charge.",
            "rental_property",
            "Rental or lease agreement",
        ),
        (
            "My landlord refuses to fix a leaking pipe in the rented apartment.",
            "rental_property",
            "Rental or lease agreement",
        ),
        (
            "My employer is withholding my salary for the last month.",
            "employment",
            "Employment agreement or offer letter",
        ),
        (
            "My employer refuses to pay my final wages after I resigned.",
            "employment",
            "Employment agreement or offer letter",
        ),
        (
            "The seller has not refunded my money after I returned the defective item.",
            "consumer",
            "Receipt, invoice, or order confirmation",
        ),
    )

    def test_complaint_categories_checklists_and_next_steps(self) -> None:
        for issue, expected_category, expected_document in self.examples:
            with self.subTest(issue=issue):
                status, payload = asgi_request(
                    "/analyze",
                    {"issue": issue, "jurisdiction": "India"},
                )
                self.assertEqual(status, 200)
                self.assertTrue(payload["success"])

                if payload["category"] is None:
                    self.assertEqual(payload["requiredDocuments"], [])
                    self.assertEqual(payload["nextSteps"], [])
                    self.assertIn("more details", payload["identifiedIssue"])
                    continue

                self.assertEqual(payload["category"], expected_category)
                self.assertIn(expected_document, payload["requiredDocuments"])
                self.assertTrue(payload["nextSteps"])
                self.assertIn("not legal advice", payload["disclaimer"].lower())

    def test_empty_issue_returns_compatible_validation_error(self) -> None:
        status, payload = asgi_request("/analyze", {"issue": "   "})

        self.assertEqual(status, 422)
        self.assertFalse(payload["success"])
        self.assertIsNotNone(payload["error"])

    def test_model_loading_failure_returns_compatible_error(self) -> None:
        with patch(
            "app.api.routes.classify_issue",
            side_effect=FileNotFoundError("missing model"),
        ):
            status, payload = asgi_request("/analyze", {"issue": "A complaint."})

        self.assertEqual(status, 503)
        self.assertFalse(payload["success"])
        self.assertIn("classifier model is unavailable", payload["error"])


if __name__ == "__main__":
    unittest.main()
