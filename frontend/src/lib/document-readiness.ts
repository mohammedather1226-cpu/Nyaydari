import type { VerificationStatus } from "./document-verification.ts";

export function calculateDocumentReadiness(
  recommendedDocuments: readonly string[],
  uploadedResults: readonly {
    documentType: string;
    name?: string;
    uploadStatus: "received" | "rejected";
    verificationStatus: VerificationStatus;
  }[],
) {
  const documents = {
    matched: [] as string[],
    needsReview: [] as string[],
    mismatch: [] as string[],
    unreadable: [] as string[],
    missing: [] as string[],
  };

  for (const documentType of new Set(recommendedDocuments)) {
    const matches = uploadedResults.filter(
      (result) =>
        result.documentType === documentType &&
        result.uploadStatus === "received",
    );
    if (matches.some((result) => result.verificationStatus === "matched")) {
      documents.matched.push(documentType);
    }
    if (matches.length === 0) {
      documents.missing.push(documentType);
    }

    for (const match of matches) {
      const label = match.name
        ? `${documentType} (${match.name})`
        : documentType;
      if (match.verificationStatus === "needs_review") {
        documents.needsReview.push(label);
      } else if (match.verificationStatus === "mismatch") {
        documents.mismatch.push(label);
      } else if (match.verificationStatus === "unreadable") {
        documents.unreadable.push(label);
      }
    }
  }

  const counts = {
    matched: documents.matched.length,
    needsReview: documents.needsReview.length,
    mismatch: documents.mismatch.length,
    unreadable: documents.unreadable.length,
    missing: documents.missing.length,
  };

  return {
    ...counts,
    documents,
    denominator: recommendedDocuments.length,
    percentage: recommendedDocuments.length
      ? Math.round((counts.matched / recommendedDocuments.length) * 100)
      : null,
  };
}
