import assert from "node:assert/strict";
import test from "node:test";
import {
  isSupportedDocumentType,
  verifyDocumentType,
} from "./document-verification.ts";
import { calculateDocumentReadiness } from "./document-readiness.ts";

test("validates a checklist document against its complaint category", () => {
  assert.equal(
    isSupportedDocumentType("rental_property", "Rental or lease agreement"),
    true,
  );
  assert.equal(
    isSupportedDocumentType("consumer", "Rental or lease agreement"),
    false,
  );
  assert.equal(
    isSupportedDocumentType("employment", "Recent payslips or wage records"),
    true,
  );
  assert.equal(
    isSupportedDocumentType("consumer", "Receipt, invoice, or order confirmation"),
    true,
  );
  assert.equal(isSupportedDocumentType("other", "Rental or lease agreement"), false);
  assert.equal(isSupportedDocumentType("__proto__", "__proto__"), false);
});

test("recognizes a rental agreement from multiple indicators", () => {
  const result = verifyDocumentType(
    "rental_property",
    "Rental or lease agreement",
    "Rental agreement between landlord and tenant. Property address is 8 Main Road. Monthly rent and security deposit are listed for the lease term.",
  );

  assert.equal(result.status, "matched");
  assert.match(result.explanation, /preliminary type match/i);
});

test("flags a bank statement as a mismatch for a rental agreement", () => {
  const result = verifyDocumentType(
    "rental_property",
    "Rental or lease agreement",
    "Bank statement for account number 1234. Statement period: June. Opening balance 500 and closing balance 300. Debit and credit transactions are listed by date.",
  );

  assert.equal(result.status, "mismatch");
  assert.match(result.explanation, /bank statement/i);
});

test("matches a security-deposit receipt using payment and rental indicators", () => {
  const result = verifyDocumentType(
    "rental_property",
    "Rent and security-deposit payment records",
    "Payment receipt. Transaction ID UPI-44. Amount paid: 20,000. Payment date: 4 June. Security deposit for rental property paid to landlord.",
  );

  assert.equal(result.status, "matched");
});

test("sends an ambiguous payment record for manual review", () => {
  const result = verifyDocumentType(
    "rental_property",
    "Rent and security-deposit payment records",
    "Payment transaction dated 4 June. Amount paid: 20,000.",
  );

  assert.equal(result.status, "needs_review");
});

test("matches a salary slip using employment and pay-period indicators", () => {
  const result = verifyDocumentType(
    "employment",
    "Recent payslips or wage records",
    "Payslip. Employee ID 45. Employer: Example Company. Salary period: June. Net pay 50,000 after deductions.",
  );

  assert.equal(result.status, "matched");
});

test("matches a consumer purchase invoice from multiple indicators", () => {
  const result = verifyDocumentType(
    "consumer",
    "Receipt, invoice, or order confirmation",
    "Tax invoice. Seller: Example Store. Invoice number 123. Product: Desk lamp. Purchase date 4 June. Total amount 2,500.",
  );

  assert.equal(result.status, "matched");
});

test("returns a mismatch for a strongly unrelated document", () => {
  const result = verifyDocumentType(
    "consumer",
    "Receipt, invoice, or order confirmation",
    "Medical report for patient A. Diagnosis and treatment were provided by the hospital physician.",
  );

  assert.equal(result.status, "mismatch");
});

test("marks empty and very short text as needing review or unreadable conservatively", () => {
  assert.equal(
    verifyDocumentType(
      "employment",
      "Recent payslips or wage records",
      "   ",
    ).status,
    "unreadable",
  );
  assert.equal(
    verifyDocumentType(
      "employment",
      "Recent payslips or wage records",
      "Payment",
    ).status,
    "needs_review",
  );
});

test("readiness counts only matched document types and retains the full denominator", () => {
  const result = calculateDocumentReadiness(
    ["Agreement", "Payment proof", "Email", "Repair record", "Notice"],
    [
      {
        documentType: "Agreement",
        uploadStatus: "received",
        verificationStatus: "matched",
      },
      {
        documentType: "Payment proof",
        uploadStatus: "received",
        verificationStatus: "needs_review",
      },
      {
        documentType: "Email",
        uploadStatus: "received",
        verificationStatus: "mismatch",
      },
      {
        documentType: "Repair record",
        uploadStatus: "received",
        verificationStatus: "unreadable",
      },
      {
        documentType: "Notice",
        uploadStatus: "rejected",
        verificationStatus: "matched",
      },
    ],
  );

  assert.equal(result.percentage, 20);
  assert.equal(result.denominator, 5);
  assert.deepEqual(result.documents, {
    matched: ["Agreement"],
    needsReview: ["Payment proof"],
    mismatch: ["Email"],
    unreadable: ["Repair record"],
    missing: ["Notice"],
  });
});

test("counts mismatched uploads separately even when another upload matches that checklist item", () => {
  const result = calculateDocumentReadiness(
    ["Rental or lease agreement", "Rent records"],
    [
      {
        documentType: "Rental or lease agreement",
        name: "lease.pdf",
        uploadStatus: "received",
        verificationStatus: "matched",
      },
      {
        documentType: "Rental or lease agreement",
        name: "statement.pdf",
        uploadStatus: "received",
        verificationStatus: "mismatch",
      },
    ],
  );

  assert.equal(result.percentage, 50);
  assert.equal(result.matched, 1);
  assert.equal(result.mismatch, 1);
  assert.deepEqual(result.documents.mismatch, [
    "Rental or lease agreement (statement.pdf)",
  ]);
  assert.deepEqual(result.documents.missing, ["Rent records"]);
});

test("does not produce a readiness percentage when there is no checklist", () => {
  const result = calculateDocumentReadiness([], []);

  assert.equal(result.percentage, null);
  assert.equal(result.denominator, 0);
  assert.equal(result.missing, 0);
});
