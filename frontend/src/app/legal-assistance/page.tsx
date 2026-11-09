"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { calculateDocumentReadiness } from "@/lib/document-readiness";
import type { VerificationStatus } from "@/lib/document-verification";

const workflowSteps = [
  { id: "issue", label: "Describe your problem" },
  { id: "documents", label: "Review identified issue" },
  { id: "upload", label: "Upload documents" },
  { id: "summary", label: "Review your summary" },
] as const;

const acceptedExtensions = [".pdf"];
const acceptedMimeTypes = new Set(["application/pdf"]);
const maxFileSize = 10 * 1024 * 1024;
const maxExtractedTextPreviewLength = 1200;

type WorkflowStage = "issue" | "documents" | "upload" | "assessment" | "summary" | "legalAid";
type IssueAnalysis = {
  success: boolean;
  demo: boolean;
  originalIssue: string | null;
  jurisdiction: string | null;
  category: string | null;
  identifiedIssue: string | null;
  explanation: string;
  requiredDocuments: string[];
  nextSteps: string[];
  disclaimer: string;
  error: string | null;
};

type FileSelection = {
  id: string;
  fingerprint: string;
  file: File;
  name: string;
  size: number;
  documentType: string;
  uploadStatus: "uploading" | "uploaded" | "error";
  processingStatus: "processing" | "processed" | "unreadable" | "error";
  extractedTextLength: number;
  extractedTextPreview: string;
  verificationStatus: VerificationStatus | null;
  verificationExplanation: string;
  message: string;
};

type ProcessDocumentResult = {
  name: string;
  documentType: string | null;
  uploadStatus: "received" | "rejected";
  status: "processed" | "unreadable" | "error";
  extractedTextLength: number;
  extractedText: string | null;
  extractedTextTruncated: boolean;
  verificationStatus: VerificationStatus;
  verificationExplanation: string;
  error: string | null;
};

type ProcessDocumentsResponse = {
  success: boolean;
  initialImplementation: true;
  files: ProcessDocumentResult[];
  error: string | null;
};

const categoryLabels: Record<string, string> = {
  rental_property: "Rental and Property",
  employment: "Employment",
  consumer: "Consumer Rights",
};

const documentReasons: Record<string, string> = {
  "Employment agreement or offer letter": "May help confirm the role and agreed employment terms.",
  "Recent payslips or wage records": "May help you organize the wages paid and any amount in question.",
  "Work-related notices or communications": "May provide a record of conversations about the issue.",
  "Records of hours worked or attendance": "May help compare the time worked with wage records.",
  "Rental or lease agreement": "May help clarify the rental terms and responsibilities discussed.",
  "Rent and security-deposit payment records": "May help track rent and deposit amounts and payment dates.",
  "Written communications with the landlord or property manager": "May provide a record of requests and responses.",
  "Repair requests, notices, or property-condition records": "May help document reported repairs or the property's condition.",
  "Receipt, invoice, or order confirmation": "May help identify the purchase or service and the amount paid.",
  "Warranty or service terms": "May help you refer to the product or service information provided.",
  "Written communications with the seller or service provider": "May provide a record of your request and the provider's response.",
  "Photos or records documenting the product or service issue": "May help you keep a record of the issue described.",
};

function getCategoryLabel(category: string | null | undefined) {
  return category
    ? categoryLabels[category] ?? "Other"
    : "Not identified";
}

function getVerificationLabel(status: VerificationStatus) {
  const labels: Record<VerificationStatus, string> = {
    matched: "Appears to match",
    needs_review: "Needs your review",
    mismatch: "May be a different document",
    unreadable: "Could not be checked",
  };
  return labels[status];
}

function getIssueExplanation(issue: string, category: string | null | undefined) {
  const examplesByCategory: Record<string, { pattern: RegExp; topic: string; records: string }[]> = {
    rental_property: [
      {
        pattern: /\b(security deposit|rental deposit|deposit)\b/i,
        topic: "a rental security deposit",
        records: "your rental agreement, deposit payment record, move-out details, and messages with the landlord",
      },
      {
        pattern: /\b(evict(?:ion)?|vacat(?:e|ion)|forced to leave|lock(?:ed)? out|leave the (?:home|house|apartment|property))\b/i,
        topic: "a tenancy or request to leave a rented property",
        records: "your rental agreement, notices or messages, and relevant dates",
      },
      {
        pattern: /\b(repair|maintenance|leak|broken|unsafe|mould|mold|damp|fix)\b/i,
        topic: "repairs or maintenance at a rented property",
        records: "your rental agreement, repair requests, photographs, and responses",
      },
      {
        pattern: /\b(rent|rental agreement|lease|tenan(?:t|cy)|landlord|property manager)\b/i,
        topic: "a rental agreement or tenancy matter",
        records: "your rental agreement, payment records, notices, and relevant messages",
      },
    ],
    employment: [
      {
        pattern: /\b(final (?:wages?|salary|pay|settlement)|last (?:wages?|salary|pay)|resign(?:ed|ation)?|left (?:my )?job)\b/i,
        topic: "final wages or payment after leaving a job",
        records: "your employment records, final payslips, resignation communications, and payment records",
      },
      {
        pattern: /\b(unpaid|withheld|delayed|missing|not paid|late)\b.{0,50}\b(salary|wages?|pay|payment)\b|\b(salary|wages?|pay|payment)\b.{0,50}\b(unpaid|withheld|delayed|missing|not paid|late)\b/i,
        topic: "salary or wages that you say have not been paid",
        records: "your employment records, payslips, attendance records, and messages about payment",
      },
      {
        pattern: /\b(terminat(?:ed|ion)|dismiss(?:ed|al)|fired|removed from (?:my )?(?:job|position))\b/i,
        topic: "a concern about the end of your employment",
        records: "your employment records and communications about the decision",
      },
      {
        pattern: /\b(workplace|employer|employee|manager|supervisor|job|work)\b/i,
        topic: "a workplace or employment matter",
        records: "your employment records and relevant workplace communications",
      },
    ],
    consumer: [
      {
        pattern: /\b(refund|reimburse(?:ment)?|money back|return(?:ed)? (?:the )?(?:product|item|order))\b/i,
        topic: "a refund or payment return request",
        records: "your receipt or order confirmation, payment record, return details, and messages with the provider",
      },
      {
        pattern: /\b(defect(?:ive)?|damaged|broken|faulty|not working)\b/i,
        topic: "a product described as defective or damaged",
        records: "your receipt, product details, photographs, and messages with the seller",
      },
      {
        pattern: /\b(not delivered|never arrived|missing (?:delivery|order|package)|did not (?:arrive|deliver))\b/i,
        topic: "a product or service you say was not delivered",
        records: "your order confirmation, payment record, delivery details, and messages with the provider",
      },
      {
        pattern: /\b(warranty|replacement|repair|service plan)\b/i,
        topic: "a warranty, repair, or replacement concern",
        records: "your receipt, warranty or service information, and messages with the provider",
      },
    ],
  };

  const categoryKey = category ?? "";
  const matchingIssue = examplesByCategory[categoryKey]?.find(({ pattern }) =>
    pattern.test(issue),
  );
  const topic = matchingIssue?.topic ?? `${getCategoryLabel(categoryKey).toLowerCase()} matter`;
  const records = matchingIssue?.records ?? "your original complaint and any related records or communications";

  return `Your complaint is grouped under ${getCategoryLabel(categoryKey)} based on its wording. It appears to concern ${topic}. You described: “${issue}” Relevant information may include ${records}.`;
}

function isProcessDocumentsResponse(value: unknown): value is ProcessDocumentsResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  return (
    typeof response.success === "boolean" &&
    response.initialImplementation === true &&
    Array.isArray(response.files) &&
    response.files.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const file = item as Record<string, unknown>;
      return (
        typeof file.name === "string" &&
        (typeof file.documentType === "string" || file.documentType === null) &&
        (file.uploadStatus === "received" || file.uploadStatus === "rejected") &&
        (file.status === "processed" || file.status === "unreadable" || file.status === "error") &&
        typeof file.extractedTextLength === "number" &&
        (file.verificationStatus === "matched" ||
          file.verificationStatus === "needs_review" ||
          file.verificationStatus === "mismatch" ||
          file.verificationStatus === "unreadable") &&
        typeof file.verificationExplanation === "string" &&
        (typeof file.error === "string" || file.error === null)
      );
    }) &&
    (typeof response.error === "string" || response.error === null)
  );
}

function isIssueAnalysis(value: unknown): value is IssueAnalysis {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  return (
    typeof response.success === "boolean" &&
    typeof response.demo === "boolean" &&
    (typeof response.originalIssue === "string" || response.originalIssue === null) &&
    (typeof response.jurisdiction === "string" || response.jurisdiction === null) &&
    (typeof response.category === "string" || response.category === null) &&
    (typeof response.identifiedIssue === "string" || response.identifiedIssue === null) &&
    typeof response.explanation === "string" &&
    Array.isArray(response.requiredDocuments) &&
    response.requiredDocuments.every((document) => typeof document === "string") &&
    Array.isArray(response.nextSteps) &&
    response.nextSteps.every((step) => typeof step === "string") &&
    typeof response.disclaimer === "string" &&
    (typeof response.error === "string" || response.error === null)
  );
}

function getFileIssue(file: File) {
  const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;

  if (!acceptedExtensions.includes(extension)) {
    return "Unsupported type. Choose a PDF file.";
  }
  if (file.type && !acceptedMimeTypes.has(file.type)) {
    return "The file type does not match the accepted PDF format.";
  }
  if (file.size === 0) {
    return "This file is empty.";
  }
  if (file.size > maxFileSize) {
    return "File exceeds the 10 MB size limit.";
  }
  return "";
}

export default function LegalAssistancePage() {
  const [problem, setProblem] = useState("");
  const [submittedProblem, setSubmittedProblem] = useState("");
  const [issueAnalysis, setIssueAnalysis] = useState<IssueAnalysis | null>(null);
  const [jurisdiction, setJurisdiction] = useState("India");
  const [state, setState] = useState("");
  const [submittedJurisdiction, setSubmittedJurisdiction] = useState("");
  const [submittedState, setSubmittedState] = useState("");
  const [error, setError] = useState("");
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);
  const [stage, setStage] = useState<WorkflowStage>("issue");
  const [hasSubmittedIssue, setHasSubmittedIssue] = useState(false);
  const [availableDocuments, setAvailableDocuments] = useState<string[]>([]);
  const [files, setFiles] = useState<FileSelection[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzedDocuments, setHasAnalyzedDocuments] = useState(false);
  const [aidState, setAidState] = useState("");
  const workflowGeneration = useRef(0);

  useEffect(() => {
    if (!isAnalyzing) return;

    const timer = window.setTimeout(() => {
      setIsAnalyzing(false);
      setHasAnalyzedDocuments(true);
      setStage("assessment");
    }, 900);

    return () => window.clearTimeout(timer);
  }, [isAnalyzing]);

  const handleAnalyzeIssue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmittingIssue) return;
    if (!problem.trim()) {
      setError("Please describe your legal problem before continuing.");
      return;
    }

    workflowGeneration.current += 1;
    setError("");
    setIssueAnalysis(null);
    setHasSubmittedIssue(false);
    setSubmittedProblem("");
    setSubmittedJurisdiction("");
    setSubmittedState("");
    setAvailableDocuments([]);
    setFiles([]);
    setUploadError("");
    setIsAnalyzing(false);
    setHasAnalyzedDocuments(false);
    setAidState("");
    setStage("issue");
    setIsSubmittingIssue(true);

    const issue = problem.trim();
    const selectedJurisdiction = [state.trim(), jurisdiction]
      .filter(Boolean)
      .join(", ");

    try {
      const response = await fetch("/api/analyze-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issue,
          ...(selectedJurisdiction ? { jurisdiction: selectedJurisdiction } : {}),
        }),
      });

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        setError("The analysis service returned an unreadable response. Please try again.");
        return;
      }

      if (!isIssueAnalysis(payload)) {
        setError("The analysis service returned an unexpected response. Please try again.");
        return;
      }
      if (!response.ok || !payload.success) {
        setError(payload.error || "We could not analyze this issue. Please review it and try again.");
        return;
      }
      if (!payload.originalIssue) {
        setError("The analysis service did not return the submitted issue. Please try again.");
        return;
      }
      if (!payload.category) {
        setError(
          payload.explanation ||
            "We could not confidently categorize this issue. Please add details about what happened and try again.",
        );
        return;
      }

      setIssueAnalysis(payload);
      setSubmittedProblem(payload.originalIssue);
      setSubmittedJurisdiction(payload.jurisdiction ?? "");
      setSubmittedState(state.trim());
      setAvailableDocuments([]);
      setHasSubmittedIssue(true);
      setStage("documents");
    } catch {
      setError("We could not reach the analysis service. Check your connection and try again.");
    } finally {
      setIsSubmittingIssue(false);
    }
  };

  const toggleDocument = (document: string) => {
    setAvailableDocuments((current) =>
      current.includes(document)
        ? current.filter((item) => item !== document)
        : [...current, document],
    );
  };

  const handleFiles = async (documentType: string, event: ChangeEvent<HTMLInputElement>) => {
    const generation = workflowGeneration.current;
    const selectedFiles = Array.from(event.target.files ?? []);
    const additions = selectedFiles.map((file) => {
      const message = getFileIssue(file);
      return {
        id: `${file.name}-${file.size}-${file.lastModified}-${documentType}`,
        fingerprint: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        name: file.name,
        size: file.size,
        documentType,
        uploadStatus: message ? ("error" as const) : ("uploading" as const),
        processingStatus: message ? ("error" as const) : ("processing" as const),
        extractedTextLength: 0,
        extractedTextPreview: "",
        verificationStatus: null,
        verificationExplanation: "",
        message: message || "Uploading to this application for initial PDF text extraction…",
      };
    });

    const existingIds = new Set(files.map((file) => file.id));
    const assignedIds = new Set(
      files
        .filter((file) => file.uploadStatus !== "error")
        .map((file) => file.fingerprint),
    );
    const uniqueAdditions = additions
      .filter((file) => !existingIds.has(file.id))
      .map((file) => {
        if (file.uploadStatus !== "error" && assignedIds.has(file.fingerprint)) {
          return {
            ...file,
            uploadStatus: "error" as const,
            processingStatus: "error" as const,
            message: "This file is already assigned to another document type. Select a different file.",
          };
        }
        if (file.uploadStatus !== "error") assignedIds.add(file.fingerprint);
        return file;
      });

    setFiles((current) => [...current, ...uniqueAdditions]);
    setUploadError("");
    event.target.value = "";

    await Promise.all(
      uniqueAdditions
        .filter((file) => file.uploadStatus === "uploading")
        .map(async (selectedFile) => {
          const formData = new FormData();
          formData.append("files", selectedFile.file, selectedFile.name);
          formData.append("documentTypes", selectedFile.documentType);
          if (issueAnalysis?.category) {
            formData.append("category", issueAnalysis.category);
          }

          try {
            const response = await fetch("/api/process-documents", {
              method: "POST",
              body: formData,
            });
            let payload: unknown;
            try {
              payload = await response.json();
            } catch {
              throw new Error("The document service returned an unreadable response.");
            }
            if (!isProcessDocumentsResponse(payload) || payload.files.length !== 1) {
              throw new Error(
                isProcessDocumentsResponse(payload) && payload.error
                  ? payload.error
                  : "The document service returned an unexpected response.",
              );
            }

            if (generation !== workflowGeneration.current) return;
            const result = payload.files[0];
            const isReceived = result.uploadStatus === "received";
            const processingStatus =
              result.status === "processed"
                ? "processed"
                : result.status === "unreadable"
                  ? "unreadable"
                  : "error";
            const message = result.error
              ?? `Text extracted (${result.extractedTextLength.toLocaleString()} characters). The type check is preliminary and does not assess legal relevance or authenticity.`;

            setFiles((current) =>
              current.map((item) =>
                item.id === selectedFile.id
                  ? {
                      ...item,
                      uploadStatus: isReceived ? "uploaded" : "error",
                      processingStatus,
                      extractedTextLength: result.extractedTextLength,
                      extractedTextPreview: result.extractedText
                        ? result.extractedText.slice(0, maxExtractedTextPreviewLength)
                        : "",
                      verificationStatus: result.verificationStatus,
                      verificationExplanation: result.verificationExplanation,
                      message,
                    }
                  : item,
              ),
            );
          } catch (uploadFailure) {
            if (generation !== workflowGeneration.current) return;
            setFiles((current) =>
              current.map((item) =>
                item.id === selectedFile.id
                  ? {
                      ...item,
                      uploadStatus: "error",
                      processingStatus: "error",
                      message:
                        uploadFailure instanceof Error
                          ? uploadFailure.message
                          : "The file could not be uploaded or processed. Please try again.",
                    }
                  : item,
              ),
            );
          }
        }),
    );
  };

  const handleAnalyzeDocuments = () => {
    const missingRequirements = available.filter(
      (document) =>
        !files.some(
          (file) => file.documentType === document && file.uploadStatus === "uploaded",
        ),
    );
    if (missingRequirements.length > 0) {
      setUploadError(
        `Add a valid file for each selected document before continuing. Still missing: ${missingRequirements.join("; ")}.`,
      );
      return;
    }

    setUploadError("");
    setHasAnalyzedDocuments(false);
    setStage("assessment");
    setIsAnalyzing(true);
  };

  const relevantDocuments = issueAnalysis?.requiredDocuments ?? [];
  const readiness = calculateDocumentReadiness(
    relevantDocuments,
    files
      .filter((file) => file.uploadStatus === "uploaded" && file.verificationStatus)
      .map((file) => ({
        documentType: file.documentType,
        name: file.name,
        uploadStatus: "received" as const,
        verificationStatus: file.verificationStatus as VerificationStatus,
      })),
  );
  const missingRecommendedDocuments = readiness.documents.missing;
  const documentCompleteness = readiness.percentage;
  const issueExplanation =
    submittedProblem && issueAnalysis?.category
      ? getIssueExplanation(submittedProblem, issueAnalysis.category)
      : "";
  const progressStageIndex =
    stage === "issue"
      ? 0
      : stage === "documents"
        ? 1
        : stage === "upload" || stage === "assessment"
          ? 2
          : 3;
  const available = relevantDocuments.filter((document) =>
    availableDocuments.includes(document),
  );
  const missing = relevantDocuments.filter(
    (document) => !availableDocuments.includes(document),
  );
  const completedRequirements = available.filter((document) =>
    files.some((file) => file.documentType === document && file.uploadStatus === "uploaded"),
  );
  const missingRequirements = available.filter(
    (document) => !completedRequirements.includes(document),
  );
  const getDocumentUploadStatus = (document: string) => {
    const matchingFiles = files.filter((file) => file.documentType === document);
    if (matchingFiles.some((file) => file.uploadStatus === "uploading")) {
      return "Uploading…";
    }
    if (matchingFiles.some((file) => file.processingStatus === "processed")) {
      return "Uploaded successfully · Text extracted";
    }
    if (matchingFiles.some((file) => file.processingStatus === "unreadable")) {
      return "Unreadable PDF";
    }
    if (matchingFiles.some((file) => file.uploadStatus === "error")) {
      return "Upload failed";
    }
    if (matchingFiles.some((file) => file.processingStatus === "error")) {
      return "Uploaded successfully · Text extraction failed";
    }
    return "Not uploaded";
  };
  const getDocumentStatusClass = (status: string) =>
    status === "Not uploaded"
      ? "document-status document-status-pending"
      : status === "Unreadable PDF" || status === "Upload failed" || status.includes("failed")
        ? "document-status document-status-error"
        : "document-status document-status-success";
  const jurisdictionLabel = issueAnalysis
    ? issueAnalysis.jurisdiction ?? ""
    : [submittedState, submittedJurisdiction].filter(Boolean).join(", ");
  const selectedFiles = files.filter(
    (file) => file.uploadStatus === "uploaded" && availableDocuments.includes(file.documentType),
  );
  const isUploading = files.some((file) => file.uploadStatus === "uploading");
  const retainedFiles = files.filter(
    (file) => !availableDocuments.includes(file.documentType),
  );
  return (
    <div className="page-shell legal-workflow">
      <div className="page-intro">
        <div className="eyebrow"><span /> YOUR FIRST STEP</div>
        <h1>{stage === "issue" ? "Describe Your Legal Problem" : "Your legal assistance guide"}</h1>
        <p>
          Organize what happened, keep track of relevant documents, and review
          general next steps. This demo does not provide legal advice.
        </p>
      </div>

      <nav className="workflow-progress" aria-label="Legal assistance progress">
        {workflowSteps.map((step, index) => {
          const isComplete = index < progressStageIndex;
          return (
            <div
              className={`workflow-progress-step${index === progressStageIndex ? " is-current" : ""}${isComplete ? " is-complete" : ""}`}
              key={step.id}
              aria-current={index === progressStageIndex ? "step" : undefined}
            >
              <span>{isComplete ? "✓" : `0${index + 1}`}</span>
              <span>{step.label}</span>
            </div>
          );
        })}
      </nav>

      {hasSubmittedIssue && (
        <section className="case-summary case-summary-redesigned panel" aria-labelledby="case-summary-title">
          <div className="case-summary-heading">
            <div>
              <div className="result-label">CASE SUMMARY</div>
              <h2 id="case-summary-title">Review your complaint</h2>
            </div>
            <button
              className="button button-secondary edit-issue-button"
              type="button"
              onClick={() => setStage("issue")}
            >
              Edit issue
            </button>
          </div>
          <div className="case-summary-highlight">
            <div className="case-summary-original">
              <div className="result-label">YOUR COMPLAINT</div>
              <p>{submittedProblem}</p>
            </div>
            <div className="case-summary-category">
              <div className="result-label">IDENTIFIED CATEGORY</div>
              <span className="category-tag">
                {getCategoryLabel(issueAnalysis?.category)}
              </span>
            </div>
          </div>
          <section className="case-summary-explanation" aria-labelledby="simple-explanation-title">
            <h3 id="simple-explanation-title">In simple language</h3>
            <p>{issueExplanation}</p>
            <span>This is an automated explanation based on the wording of your complaint.</span>
          </section>
          <div className="case-summary-jurisdiction">
            <strong>Jurisdiction</strong>
            <span>{jurisdictionLabel || "Not specified"}</span>
          </div>
          <p className="case-summary-disclaimer">
            This is an automated preliminary explanation based on your complaint, not legal advice or a verified legal assessment. Suggested documents are general examples and may not apply to every situation. Consult a qualified legal professional for advice.
          </p>
        </section>
      )}

      {stage === "issue" && (
        <>
          <form className="assistance-layout" onSubmit={handleAnalyzeIssue} noValidate>
            <div className="form-column">
              <section className="panel problem-panel">
                <div className="panel-heading">
                  <div className="step-number">01</div>
                  <div>
                    <h2>What&apos;s going on?</h2>
                    <p>Share only what you feel comfortable sharing.</p>
                  </div>
                </div>
                <label className="field-label" htmlFor="problem">
                  Describe your situation <span>(required)</span>
                </label>
                <textarea
                  id="problem"
                  className="problem-textarea"
                  maxLength={2000}
                  placeholder="For example: I moved out of my rented apartment two months ago, but my landlord has not returned my security deposit or explained why..."
                  value={problem}
                  onChange={(event) => {
                    setProblem(event.target.value);
                    if (error) setError("");
                  }}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "problem-error" : "problem-hint"}
                />
                <div className="textarea-footer">
                  <span id={error ? "problem-error" : "problem-hint"} className={error ? "field-error" : ""} role={error ? "alert" : undefined}>
                    {error || "Please avoid sharing highly sensitive personal details."}
                  </span>
                  <span>{problem.length}/2,000</span>
                </div>
                <label className="field-label jurisdiction-label" htmlFor="jurisdiction">
                  Where is this happening?
                </label>
                <div className="jurisdiction-fields">
                  <select
                    id="jurisdiction"
                    value={jurisdiction}
                    onChange={(event) => {
                      setJurisdiction(event.target.value);
                      setState("");
                    }}
                    className="form-select"
                  >
                    <option>India</option>
                    <option>Other / not sure</option>
                  </select>
                  {jurisdiction === "India" ? (
                    <select
                      aria-label="Specify your state or union territory"
                      value={state}
                      onChange={(event) => setState(event.target.value)}
                      className="form-select"
                    >
                      <option value="">Select state / union territory (optional)</option>
                      {[
                        "Andhra Pradesh", "Delhi", "Gujarat", "Karnataka", "Kerala",
                        "Maharashtra", "Punjab", "Rajasthan", "Tamil Nadu",
                        "Telangana", "Uttar Pradesh", "West Bengal",
                      ].map((option) => <option key={option}>{option}</option>)}
                    </select>
                  ) : (
                    <input
                      aria-label="Specify your country or region"
                      className="form-input"
                      placeholder="Specify country or region (optional)"
                      value={state}
                      onChange={(event) => setState(event.target.value)}
                    />
                  )}
                </div>
                <button className="button button-primary analyze-button" type="submit" disabled={isSubmittingIssue}>
                  {isSubmittingIssue
                    ? "Analyzing issue…"
                    : hasSubmittedIssue
                      ? "Save changes and continue"
                      : "Analyze Issue"}
                  {!isSubmittingIssue && <span aria-hidden="true">→</span>}
                </button>
                <p className="form-footnote">
                  Your issue is sent to this application&apos;s API for preliminary machine-learning classification. It is not sent to an external AI service.
                </p>
                {isSubmittingIssue && (
                  <p className="form-footnote" role="status" aria-live="polite">
                    Requesting a demo analysis. Please wait.
                  </p>
                )}
              </section>
            </div>
            <aside className="side-note">
              <span className="side-note-icon" aria-hidden="true">✳</span>
              <h3>A good first step</h3>
              <p>
                Include what happened, when it happened, and what outcome
                you&apos;re hoping for. You don&apos;t need to know the legal terms.
              </p>
              <div className="side-note-rule" />
              <p className="side-note-small">
                Please don&apos;t include account numbers, identity documents or
                other sensitive personal information.
              </p>
              <div className="trust-note"><span aria-hidden="true">⌑</span> General information only</div>
            </aside>
          </form>
        </>
      )}

      {stage === "documents" && (
        <section className="workflow-content" aria-labelledby="documents-title">
          <div className="results-heading">
            <div>
              <div className="eyebrow"><span /> PRELIMINARY MACHINE-LEARNING CLASSIFICATION</div>
              <h2>Start with documents you may have.</h2>
              <p>
                This complaint is grouped under {getCategoryLabel(issueAnalysis?.category)}.
              </p>
            </div>
            <span className="demo-badge">DEMO · TRAINED ML CLASSIFIER</span>
          </div>
          <div className="sample-alert" role="note">
            <span aria-hidden="true">ⓘ</span>
            <span><strong>Preliminary checklist only.</strong> These general suggestions are not mandatory legal requirements.</span>
          </div>
          <article className="result-card">
            <div className="result-label">
              {issueAnalysis?.category
                ? `DOCUMENTS FOR ${getCategoryLabel(issueAnalysis.category).toUpperCase()}`
                : "SUGGESTED DOCUMENTS"}
            </div>
            <h2 id="documents-title" className="workflow-section-title">Which of these do you already have?</h2>
            <div className="document-checklist">
              {relevantDocuments.map((document, index) => {
                const isAvailable = availableDocuments.includes(document);
                const status = getDocumentUploadStatus(document);
                const inputId = `checklist-file-${index}`;
                return (
                  <article className="checklist-card" key={document}>
                    <div className="checklist-card-copy">
                      <label className="checklist-card-title">
                        <input
                          type="checkbox"
                          checked={isAvailable}
                          onChange={() => toggleDocument(document)}
                        />
                        <span>{document}</span>
                      </label>
                      <p>{documentReasons[document] ?? "May help you organize records related to your complaint."}</p>
                    </div>
                    <div className="checklist-card-actions">
                      <span className={getDocumentStatusClass(status)}>{status}</span>
                      <label className="button button-secondary checklist-upload-button" htmlFor={inputId}>
                        {status === "Not uploaded" || status === "Upload failed" ? "Upload PDF" : "Replace PDF"}
                      </label>
                      <input
                        id={inputId}
                        className="visually-hidden-file-input"
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={(event) => handleFiles(document, event)}
                      />
                    </div>
                  </article>
                );
              })}
              {relevantDocuments.length === 0 && (
                <p className="upload-empty-state">
                  The demo did not return a document checklist for this issue. You can continue without selecting documents.
                </p>
              )}
            </div>
            <div className="document-columns">
              <div><strong className="status-available">Selected as available ({available.length})</strong><p>{available.length ? available.join(", ") : "None selected yet."}</p></div>
              <div>
                <strong className="status-missing">Not selected ({missing.length})</strong>
                <p>
                  {missing.length
                    ? missing.join(", ")
                    : relevantDocuments.length
                      ? "All checklist items selected."
                      : "No checklist items were returned."}
                </p>
              </div>
            </div>
            <div className="workflow-actions">
              <button className="button button-primary" type="button" onClick={() => setStage("upload")}>
                Continue to Upload <span aria-hidden="true">→</span>
              </button>
            </div>
          </article>
        </section>
      )}

      {stage === "upload" && (
        <section className="workflow-content" aria-labelledby="upload-title">
          <div className="results-heading">
            <div>
              <div className="eyebrow"><span /> DOCUMENTS</div>
              <h2 id="upload-title">Add the files you selected.</h2>
              <p>Choose files that correspond to the checklist. You can return and change your selections at any time.</p>
            </div>
            <span className="demo-badge">INITIAL PDF PROCESSING</span>
          </div>
          <div className="sample-alert" role="note">
            <span aria-hidden="true">ⓘ</span>
            <span><strong>Initial server-side PDF processing.</strong> Selected PDFs are sent to this application for text extraction and are not saved permanently. Extracted text does not verify authenticity or establish whether a legal claim will succeed. A qualified legal professional must review the evidence. OCR is not performed. Avoid uploading highly sensitive information.</span>
          </div>
          <article className="result-card upload-stage-card">
            <div className="upload-counts" aria-live="polite">
              <div><strong>{available.length}</strong><span>Selected document types</span></div>
              <div><strong>{completedRequirements.length}</strong><span>Requirements uploaded</span></div>
              <div><strong>{missingRequirements.length}</strong><span>Remaining uploads</span></div>
            </div>
            {available.length > 0 ? (
              <div className="upload-requirements">
                {available.map((document, index) => {
                  const matchingFiles = files.filter((file) => file.documentType === document);
                  const isComplete = matchingFiles.some((file) => file.uploadStatus === "uploaded");
                  const status = getDocumentUploadStatus(document);
                  return (
                    <section className="upload-requirement" key={document}>
                      <div className="upload-requirement-heading">
                        <div>
                          <h3>{document}</h3>
                          <span className={getDocumentStatusClass(status)}>{status}</span>
                        </div>
                        <label className="button button-secondary upload-file-button" htmlFor={`document-file-${index}`}>
                          {isComplete ? "Add another file" : "Choose PDF"}
                        </label>
                        <input
                          id={`document-file-${index}`}
                          className="visually-hidden-file-input"
                          type="file"
                          accept=".pdf,application/pdf"
                          onChange={(event) => handleFiles(document, event)}
                        />
                      </div>
                      {matchingFiles.length > 0 ? (
                        <ul className="file-status-list" aria-label={`Files for ${document}`}>
                          {matchingFiles.map((file) => (
                            <li key={file.id} className={file.uploadStatus === "error" || file.processingStatus === "unreadable" ? "file-status-error" : ""}>
                              <span className="file-status-name">{file.name}</span>
                              <span>
                                {file.uploadStatus === "uploading"
                                  ? "Uploading…"
                                  : file.uploadStatus === "error"
                                    ? file.message
                                    : file.processingStatus === "processed"
                                      ? `${file.extractedTextLength.toLocaleString()} characters extracted. ${file.message}`
                                      : file.processingStatus === "unreadable"
                                        ? file.message
                                        : `Text extraction failed. ${file.message}`}
                              </span>
                              {file.verificationStatus && (
                                <span
                                  className={`verification-status verification-status-${file.verificationStatus}`}
                                  role="status"
                                >
                                  <strong>{getVerificationLabel(file.verificationStatus)}</strong>
                                  {" · "}
                                  {file.verificationExplanation}
                                </span>
                              )}
                              {file.processingStatus === "processed" &&
                                file.extractedTextPreview && (
                                  <details>
                                    <summary>Extracted text preview</summary>
                                    <pre
                                      style={{
                                        whiteSpace: "pre-wrap",
                                        overflowWrap: "anywhere",
                                      }}
                                    >
                                      {file.extractedTextPreview}
                                    </pre>
                                  </details>
                                )}
                              <button
                                type="button"
                                className="remove-file-button"
                                onClick={() => setFiles((current) => current.filter((item) => item.id !== file.id))}
                                aria-label={`Remove ${file.name} for ${document}`}
                              >
                                {file.verificationStatus === "mismatch" ||
                                file.verificationStatus === "needs_review" ||
                                file.verificationStatus === "unreadable"
                                  ? "Remove and replace"
                                  : "Remove"}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="upload-empty-state">No file selected for this document type.</p>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
              <p className="upload-empty-state">No document types selected. You can continue to a demo assessment without document uploads.</p>
            )}
            {files.some((file) => !availableDocuments.includes(file.documentType)) && (
              <section className="retained-files">
                <h3>Files retained for documents no longer selected</h3>
                <p>These files have not been removed. Re-select the document type to use its existing file, or remove it explicitly.</p>
                <ul className="file-status-list">
                  {files.filter((file) => !availableDocuments.includes(file.documentType)).map((file) => (
                    <li key={file.id} className={file.uploadStatus === "error" || file.processingStatus === "unreadable" ? "file-status-error" : ""}>
                      <span className="file-status-name">{file.name} · {file.documentType}</span>
                      <span>
                        {file.uploadStatus === "uploaded"
                          ? `${getDocumentUploadStatus(file.documentType)} · retained for a deselected requirement. ${file.message}`
                          : file.uploadStatus === "uploading"
                            ? "Uploading…"
                            : file.message}
                      </span>
                      <button
                        type="button"
                        className="remove-file-button"
                        onClick={() => setFiles((current) => current.filter((item) => item.id !== file.id))}
                        aria-label={`Remove ${file.name}`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {missingRequirements.length > 0 && (
              <p className="upload-validation-error" role="status">
                Still needed: {missingRequirements.join("; ")}.
              </p>
            )}
            {uploadError && <p className="upload-validation-error" role="alert">{uploadError}</p>}
            <div className="workflow-actions workflow-actions-between">
              <button className="button button-secondary" type="button" onClick={() => setStage("documents")}>
                ← Back to Document Selection
              </button>
              <button className="button button-primary" type="button" onClick={handleAnalyzeDocuments} disabled={missingRequirements.length > 0 || isAnalyzing || isUploading}>
                {isUploading ? "Processing files…" : "Continue to Assessment"} {!isUploading && <span aria-hidden="true">→</span>}
              </button>
            </div>
          </article>
        </section>
      )}

      {(isAnalyzing || (stage === "assessment" && hasAnalyzedDocuments)) && (
        <section className="workflow-content assessment-content" aria-live="polite">
          {isAnalyzing ? (
            <div className="analysis-loading" role="status">
              <span className="loading-spinner" aria-hidden="true" />
              <h2>Preparing the preliminary assessment…</h2>
              <p>PDF text extraction has finished. No legal relevance analysis or authenticity verification is performed.</p>
            </div>
          ) : (
            <>
              <div className="results-heading">
                <div>
                  <div className="eyebrow"><span /> PRELIMINARY CASE ASSESSMENT</div>
                  <h2>What this demo can—and can&apos;t—tell you.</h2>
                  <p>This preliminary readiness score counts checklist document types whose extracted text appears to match the requested type. It does not interpret legal relevance.</p>
                </div>
                <span className="demo-badge">INITIAL PROCESSING · NOT VERIFIED</span>
              </div>
              <div className="sample-alert" role="note">
                <span aria-hidden="true">ⓘ</span>
                <span><strong>Document checks are preliminary and based on extractable PDF text.</strong> They do not verify authenticity, signatures, legal validity, or whether the document proves your claim. Please review the uploaded documents yourself. Scanned PDFs may have no extractable text; OCR is not performed.</span>
              </div>
              <article className="result-card result-wide">
                <div className="result-label">DOCUMENT STATUS</div>
                <h3 className="assessment-card-title">Files received ({selectedFiles.length})</h3>
                <ul className="analysis-file-list">
                  {selectedFiles.map((file) => (
                    <li key={file.id}>
                      <strong>{file.name} — {file.documentType}</strong>
                      <span>
                        {file.processingStatus === "processed"
                          ? `Text extracted (${file.extractedTextLength.toLocaleString()} characters) · not analyzed for legal relevance · authenticity not verified`
                          : file.processingStatus === "unreadable"
                            ? `Unreadable: ${file.message}`
                            : `Text extraction failed: ${file.message}`}
                      </span>
                      <span className={`verification-status verification-status-${file.verificationStatus ?? "unreadable"}`}>
                        <strong>{getVerificationLabel(file.verificationStatus ?? "unreadable")}</strong>
                        {" · "}
                        {file.verificationExplanation || "The document type could not be checked."}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="result-body">
                  Extracted text is not interpreted for legal meaning. Files with upload errors are listed in the upload stage and are not counted as received.
                </p>
              </article>
              <div className="results-grid assessment-grid">
                <article className="result-card result-featured">
                  <div className="result-label">DOCUMENT COMPLETENESS</div>
                  {documentCompleteness === null ? (
                    <>
                      <h3 className="readiness-title">Assessment unavailable</h3>
                      <p className="result-body">No recommended checklist was returned, so document completeness cannot be calculated.</p>
                    </>
                  ) : (
                    <div className="readiness-display">
                      <h3 className="readiness-title">{documentCompleteness}% document readiness</h3>
                      <div
                        className="readiness-progress"
                        role="progressbar"
                        aria-label="Document readiness"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={documentCompleteness}
                      >
                        <span style={{ width: `${documentCompleteness}%` }} />
                      </div>
                      <p className="readiness-count">
                        {readiness.matched} of {relevantDocuments.length} recommended documents appear to match the requested type
                      </p>
                      <p className="readiness-remaining">
                        {readiness.missing} {readiness.missing === 1 ? "document" : "documents"} still missing
                      </p>
                      <p className="result-body">
                        This preliminary type/readiness score is not a measure of authenticity, legal validity, evidence sufficiency, case strength, or likely outcome.
                      </p>
                    </div>
                  )}
                </article>
                <article className="result-card">
                  <div className="result-label">DOCUMENT READINESS DETAILS</div>
                  <p className="result-body"><strong>Appear to match:</strong> {readiness.documents.matched.length ? readiness.documents.matched.join("; ") : "None."}</p>
                  <p className="result-body"><strong>Need manual review ({readiness.needsReview}):</strong> {readiness.documents.needsReview.length ? readiness.documents.needsReview.join("; ") : "None."}</p>
                  <p className="result-body"><strong>Mismatched ({readiness.mismatch}):</strong> {readiness.documents.mismatch.length ? readiness.documents.mismatch.join("; ") : "None."}</p>
                  <p className="result-body"><strong>Unreadable ({readiness.unreadable}):</strong> {readiness.documents.unreadable.length ? readiness.documents.unreadable.join("; ") : "None."}</p>
                  <p className="result-body"><strong>Still missing ({readiness.missing}):</strong> {missingRecommendedDocuments.length ? missingRecommendedDocuments.join("; ") : relevantDocuments.length ? "None." : "None recommended."}</p>
                  <p className="result-body">A type match is only a preliminary indication based on extracted text. It does not verify authenticity, signatures, legal validity, or whether the document proves your claim. Please review the uploaded documents yourself.</p>
                </article>
                <article className="result-card">
                  <div className="result-label">APPROXIMATE CASE DURATION</div>
                  <h3 className="assessment-card-title">No reliable range available</h3>
                  <p className="result-body">No numerical estimate is provided. Actual duration depends on jurisdiction, dispute complexity, deadlines, and the legal process.</p>
                </article>
                <article className="result-card">
                  <div className="result-label">APPROXIMATE CASE COST</div>
                  <h3 className="assessment-card-title">No reliable range available</h3>
                  <p className="result-body">No numerical estimate is provided. Actual costs depend on jurisdiction, dispute complexity, and the legal process.</p>
                </article>
                <article className="result-card result-wide guidance-card">
                  <div className="result-label">LIMITATIONS AND DISCLAIMER</div>
                  <p className="result-body">This preliminary checklist and document-readiness score do not establish whether a legal claim will succeed. PDF text extraction does not verify document authenticity. A qualified legal professional must review the evidence and advise on rights, deadlines, costs, and process.</p>
                </article>
              </div>
              <div className="workflow-actions workflow-actions-between">
                <button className="button button-secondary" type="button" onClick={() => setStage("upload")}>
                  ← Back to Documents
                </button>
                <button className="button button-primary" type="button" onClick={() => setStage("summary")}>
                  Continue to Case Summary <span aria-hidden="true">→</span>
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {stage === "summary" && hasAnalyzedDocuments && (
        <section className="workflow-content" aria-labelledby="case-summary-next-steps-title">
          <div className="results-heading">
            <div>
              <div className="eyebrow"><span /> YOUR RESULTS</div>
              <h2 id="case-summary-next-steps-title">Case Summary &amp; Next Steps</h2>
              <p>A concise record of your issue, document status, and practical next steps.</p>
            </div>
            <span className="demo-badge">DEMO · NOT LEGAL ADVICE</span>
          </div>
          <div className="sample-alert" role="note">
            <span aria-hidden="true">ⓘ</span>
            <span><strong>Initial document processing.</strong> This application extracts text from PDFs but does not assess legal relevance, perform OCR, or verify authenticity.</span>
          </div>
          <div className="results-grid">
            <article className="result-card">
              <div className="result-label">YOUR ORIGINAL LEGAL ISSUE</div>
              <p className="result-body">{submittedProblem}</p>
              <p className="result-body"><strong>Jurisdiction:</strong> {jurisdictionLabel || "Not specified"}</p>
            </article>
            <article className="result-card">
              <div className="result-label">IDENTIFIED CATEGORY</div>
              <p className="result-body"><span className="category-tag">{getCategoryLabel(issueAnalysis?.category)}</span></p>
              <h3 className="summary-simple-language-title">In simple language</h3>
              <p className="result-body">{issueExplanation}</p>
              <p className="result-body"><strong>Suggested documents:</strong> {issueAnalysis?.requiredDocuments.length ? issueAnalysis.requiredDocuments.join("; ") : "The demo did not identify a document checklist."}</p>
            </article>
            <article className="result-card result-wide">
              <div className="result-label">DOCUMENTS RECEIVED AND STILL MISSING</div>
              <div className="summary-readiness">
                {documentCompleteness === null ? (
                  <strong>Assessment unavailable.</strong>
                ) : (
                  <>
                    <h3>{documentCompleteness}% document readiness</h3>
                    <div
                      className="readiness-progress"
                      role="progressbar"
                      aria-label="Document readiness"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={documentCompleteness}
                    >
                      <span style={{ width: `${documentCompleteness}%` }} />
                    </div>
                    <p>
                      {readiness.matched} of {relevantDocuments.length} recommended documents appear to match the requested type · {readiness.missing} {readiness.missing === 1 ? "document" : "documents"} still missing
                    </p>
                  </>
                )}
              </div>
              <p className="result-body"><strong>Appear to match:</strong> {readiness.documents.matched.length ? readiness.documents.matched.join("; ") : "None."}</p>
              <p className="result-body"><strong>Need manual review ({readiness.needsReview}):</strong> {readiness.documents.needsReview.length ? readiness.documents.needsReview.join("; ") : "None."}</p>
              <p className="result-body"><strong>Mismatched ({readiness.mismatch}):</strong> {readiness.documents.mismatch.length ? readiness.documents.mismatch.join("; ") : "None."}</p>
              <p className="result-body"><strong>Unreadable ({readiness.unreadable}):</strong> {readiness.documents.unreadable.length ? readiness.documents.unreadable.join("; ") : "None."}</p>
              <p className="result-body"><strong>Still missing ({readiness.missing}):</strong> {missingRecommendedDocuments.length ? missingRecommendedDocuments.join("; ") : relevantDocuments.length ? "None." : "None recommended."}</p>
              <p className="result-body"><strong>Documents received ({selectedFiles.length}):</strong> {selectedFiles.length ? selectedFiles.map((file) => `${file.name} (${file.documentType})`).join("; ") : "None."}</p>
              <p className="result-body"><strong>Selected requirements received ({completedRequirements.length}/{available.length}):</strong> {completedRequirements.length ? completedRequirements.join("; ") : "None"}.</p>
              <p className="result-body"><strong>Still missing for your selections:</strong> {missingRequirements.length ? missingRequirements.join("; ") : available.length ? "No selected document type is missing an upload." : "You did not select any document types as available."}</p>
              <p className="result-body"><strong>Not selected as available:</strong> {missing.length ? missing.join("; ") : "None."} Received documents are not necessarily readable or relevant evidence.</p>
              {selectedFiles.some((file) => file.processingStatus === "unreadable") && (
                <p className="result-body"><strong>Unreadable documents:</strong> {selectedFiles.filter((file) => file.processingStatus === "unreadable").map((file) => `${file.name}: ${file.message}`).join("; ")}.</p>
              )}
              {retainedFiles.length > 0 && (
                <p className="result-body"><strong>Retained for deselected document types:</strong> {retainedFiles.map((file) => `${file.name} (${file.documentType})`).join("; ")}. These files are preserved in this page&apos;s state and are not counted toward current requirements.</p>
              )}
              {files.some((file) => file.uploadStatus === "error") && (
                <p className="result-body"><strong>Upload errors:</strong> {files.filter((file) => file.uploadStatus === "error").map((file) => `${file.name} (${file.documentType}): ${file.message}`).join("; ")}</p>
              )}
              {selectedFiles.some((file) => file.processingStatus === "error") && (
                <p className="result-body"><strong>Text extraction errors:</strong> {selectedFiles.filter((file) => file.processingStatus === "error").map((file) => `${file.name}: ${file.message}`).join("; ")}</p>
              )}
            </article>
            <article className="result-card result-wide">
              <div className="result-label">DOCUMENT ANALYSIS FINDINGS</div>
              <p className="result-body">Text was extracted from readable PDFs, but no legal relevance analysis was performed. A successful extraction does not establish that a document supports a claim, and authenticity has not been independently verified. No OCR was performed on scanned documents.</p>
            </article>
            <article className="result-card result-featured">
              <div className="result-label">LEGAL OUTCOME</div>
              <h3>No outcome prediction provided</h3>
              <p className="result-body">The classifier and document-readiness score do not establish whether a legal claim will succeed. Document contents require review by a qualified legal professional.</p>
            </article>
            <article className="result-card">
              <div className="result-label">DURATION AND COST</div>
              <p className="result-body"><strong>Duration:</strong> No numerical estimate is provided. Actual timing depends on jurisdiction, dispute complexity, deadlines, and the legal process.</p>
              <p className="result-body"><strong>Cost:</strong> No numerical estimate is provided. Actual costs depend on jurisdiction, dispute complexity, and the legal process.</p>
            </article>
            <article className="result-card result-wide">
              <div className="result-label">RECOMMENDED NEXT STEPS</div>
              {issueAnalysis?.nextSteps.length ? (
                <ol className="next-step-list">
                  {issueAnalysis.nextSteps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}
                </ol>
              ) : (
                <p className="result-body">No category-specific next steps were returned. Write down relevant dates and consult a qualified lawyer or official legal aid authority for guidance.</p>
              )}
              <p className="result-body"><strong>API disclaimer:</strong> {issueAnalysis?.disclaimer}</p>
              <p className="result-body">The document-readiness score is not a legal-outcome prediction. Duration and cost are not estimated; consult a qualified legal professional familiar with the jurisdiction and dispute.</p>
            </article>
          </div>
          <div className="summary-actions">
            <button
              className="button button-primary legal-aid-cta"
              type="button"
              onClick={() => {
                setAidState(submittedState);
                setStage("legalAid");
              }}
            >
              Check Legal Aid Eligibility <span aria-hidden="true">→</span>
            </button>
            <p>This is optional. You can review the summary and next steps without completing an eligibility check.</p>
          </div>
          <div className="workflow-actions workflow-actions-between">
            <button className="button button-secondary" type="button" onClick={() => setStage("assessment")}>
              ← Back to Assessment
            </button>
            <button className="button button-secondary" type="button" onClick={() => setStage("upload")}>
              Review Documents
            </button>
          </div>
        </section>
      )}

      {stage === "legalAid" && (
        <section className="workflow-content" aria-labelledby="legal-aid-title">
          <div className="results-heading">
            <div>
              <div className="eyebrow"><span /> OPTIONAL · LEGAL AID</div>
              <h2 id="legal-aid-title">Check Legal Aid Eligibility</h2>
              <p>This page provides official contact starting points, not an eligibility determination.</p>
            </div>
            <span className="demo-badge">INFORMATION ONLY</span>
          </div>
          <div className="sample-alert" role="note">
            <span aria-hidden="true">ⓘ</span>
            <span><strong>No eligibility application is submitted.</strong> This demo does not store or send your details and cannot confirm eligibility.</span>
          </div>
          <article className="result-card">
            <div className="result-label">JURISDICTION TO CONTACT</div>
            <p className="result-body">Your jurisdiction helps identify which official legal services authority can explain the applicable programs and criteria.</p>
            {submittedJurisdiction === "India" ? (
              <div className="aid-state-field">
                <label className="field-label" htmlFor="aid-state">State or union territory (optional)</label>
                <select
                  id="aid-state"
                  className="form-select"
                  value={aidState}
                  onChange={(event) => setAidState(event.target.value)}
                >
                  <option value="">Select state / union territory</option>
                  {[
                    "Andhra Pradesh", "Delhi", "Gujarat", "Karnataka", "Kerala",
                    "Maharashtra", "Punjab", "Rajasthan", "Tamil Nadu",
                    "Telangana", "Uttar Pradesh", "West Bengal",
                  ].map((option) => <option key={option}>{option}</option>)}
                </select>
                <p className="upload-help">This helps you identify a state or district legal services authority. You may leave it blank and use the national authority.</p>
              </div>
            ) : (
              <p className="result-body"><strong>Entered jurisdiction:</strong> {jurisdictionLabel || "Not specified"}</p>
            )}
            <div className="aid-eligibility-info">
              <h3>Potential eligibility</h3>
              <p>
                Eligibility cannot be determined here. Criteria and any income
                thresholds depend on the applicable official program and
                jurisdiction. This demo does not have verified, state-specific
                criteria to compare against your circumstances.
              </p>
              <p>
                No income or other sensitive personal details are requested:
                without verified local criteria, requesting them would not
                support a reliable result. Ask the official authority what
                information and documents it requires.
              </p>
            </div>
            {submittedJurisdiction === "India" ? (
              <div className="official-aid-link">
                <div className="result-label">OFFICIAL STARTING POINT</div>
                <p className="result-body">
                  Contact the National Legal Services Authority (NALSA) for
                  information and official state/district legal services
                  authority contacts. Ask the relevant authority about
                  current eligibility criteria and application steps.
                </p>
                <a href="https://nalsa.gov.in/" target="_blank" rel="noreferrer">
                  National Legal Services Authority (NALSA) official website ↗
                </a>
              </div>
            ) : (
              <div className="official-aid-link">
                <div className="result-label">FIND AN OFFICIAL AUTHORITY</div>
                <p className="result-body">
                  Reliable legal aid program information is not available
                  here for this jurisdiction. Contact the government legal
                  aid authority or court information service for your area;
                  confirm that any website is official before sharing details.
                </p>
              </div>
            )}
          </article>
          <div className="workflow-actions workflow-actions-between">
            <button className="button button-secondary" type="button" onClick={() => setStage("summary")}>
              ← Back to Case Summary
            </button>
            <button className="button button-secondary" type="button" onClick={() => setStage("summary")}>
              Return to Case Summary
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
