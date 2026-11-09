"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

const workflowSteps = [
  { id: "issue", label: "Describe issue" },
  { id: "documents", label: "Select documents" },
  { id: "upload", label: "Add files" },
  { id: "assessment", label: "Assessment" },
  { id: "summary", label: "Case summary" },
  { id: "legalAid", label: "Legal aid (optional)" },
] as const;

const acceptedExtensions = [".pdf"];
const acceptedMimeTypes = new Set(["application/pdf"]);
const maxFileSize = 10 * 1024 * 1024;
const maxExtractedTextPreviewLength = 1200;

type WorkflowStage = (typeof workflowSteps)[number]["id"];
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
  error: string | null;
};

type ProcessDocumentsResponse = {
  success: boolean;
  initialImplementation: true;
  files: ProcessDocumentResult[];
  error: string | null;
};

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
              ?? `Text extracted (${result.extractedTextLength.toLocaleString()} characters). Contents have not been assessed or verified.`;

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
  const readableRecommendedDocuments = relevantDocuments.filter((document) =>
    files.some(
      (file) =>
        file.documentType === document &&
        file.uploadStatus === "uploaded" &&
        file.processingStatus === "processed",
    ),
  );
  const unreadableRecommendedDocuments = relevantDocuments.filter((document) =>
    files.some(
      (file) =>
        file.documentType === document &&
        file.uploadStatus === "uploaded" &&
        file.processingStatus === "unreadable" &&
        !readableRecommendedDocuments.includes(document),
    ),
  );
  const missingRecommendedDocuments = relevantDocuments.filter(
    (document) => !readableRecommendedDocuments.includes(document),
  );
  const documentCompleteness = relevantDocuments.length
    ? Math.round((readableRecommendedDocuments.length / relevantDocuments.length) * 100)
    : null;
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
  const currentStageIndex = workflowSteps.findIndex((step) => step.id === stage);

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
          const isComplete = index < currentStageIndex;
          return (
            <div
              className={`workflow-progress-step${stage === step.id ? " is-current" : ""}${isComplete ? " is-complete" : ""}`}
              key={step.id}
              aria-current={stage === step.id ? "step" : undefined}
            >
              <span>{isComplete ? "✓" : `0${index + 1}`}</span>
              <span>{step.label}</span>
            </div>
          );
        })}
      </nav>

      {hasSubmittedIssue && (
        <section className="case-summary panel" aria-labelledby="case-summary-title">
          <div className="case-summary-heading">
            <div>
              <div className="result-label">YOUR CASE SUMMARY</div>
              <h2 id="case-summary-title">Your information, kept in view</h2>
            </div>
            <button
              className="button button-secondary edit-issue-button"
              type="button"
              onClick={() => setStage("issue")}
            >
              Edit issue
            </button>
          </div>
          <dl className="case-summary-grid">
            <div className="case-summary-original">
              <dt>Your original legal problem</dt>
              <dd>{submittedProblem}</dd>
            </div>
            <div>
              <dt>Identified legal issue</dt>
              <dd>{issueAnalysis?.identifiedIssue ?? "Not available"}</dd>
            </div>
            <div>
              <dt>Legal category</dt>
              <dd><span className="category-tag">{issueAnalysis?.category ?? "Unclear / unsupported"}</span></dd>
            </div>
            <div>
              <dt>In simple language</dt>
              <dd>{issueAnalysis?.explanation}</dd>
            </div>
            <div>
              <dt>Jurisdiction / state</dt>
              <dd>{jurisdictionLabel || "Not specified"}</dd>
            </div>
          </dl>
          <p className="demo-inline-note">
            {issueAnalysis?.disclaimer}
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
              <p>{issueAnalysis?.identifiedIssue ?? "The demo could not classify this issue."}</p>
            </div>
            <span className="demo-badge">DEMO · TRAINED ML CLASSIFIER</span>
          </div>
          <div className="sample-alert" role="note">
            <span aria-hidden="true">ⓘ</span>
            <span><strong>Preliminary checklist only.</strong> {issueAnalysis?.explanation} These suggestions are not mandatory legal requirements.</span>
          </div>
          <article className="result-card">
            <div className="result-label">
              {issueAnalysis?.category && issueAnalysis.category !== "Unclear / unsupported"
                ? `DOCUMENTS FOR ${issueAnalysis.category.toUpperCase()}`
                : "SUGGESTED DOCUMENTS"}
            </div>
            <h2 id="documents-title" className="workflow-section-title">Which of these do you already have?</h2>
            <div className="document-checklist">
              {relevantDocuments.map((document) => {
                const isAvailable = availableDocuments.includes(document);
                return (
                  <label className="checklist-row" key={document}>
                    <input
                      type="checkbox"
                      checked={isAvailable}
                      onChange={() => toggleDocument(document)}
                    />
                    <span>{document}</span>
                    <span className={isAvailable ? "status-available" : "status-missing"}>
                      {isAvailable ? "Selected as available" : "Not selected"}
                    </span>
                  </label>
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
                  const isProcessing = matchingFiles.some((file) => file.uploadStatus === "uploading");
                  return (
                    <section className="upload-requirement" key={document}>
                      <div className="upload-requirement-heading">
                        <div>
                          <h3>{document}</h3>
                          <span className={isComplete ? "status-available" : "status-missing"}>
                            {isProcessing
                              ? "Uploading and extracting text…"
                              : isComplete
                                ? "File received by server"
                                : "File required"}
                          </span>
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
                                  ? "Uploading and extracting text…"
                                  : file.uploadStatus === "error"
                                    ? `Upload failed. ${file.message}`
                                    : file.processingStatus === "processed"
                                      ? `Received by server · ${file.extractedTextLength.toLocaleString()} characters extracted · ${file.message}`
                                      : file.processingStatus === "unreadable"
                                        ? `Received by server, but unreadable. ${file.message}`
                                        : `Received by server, but text extraction failed. ${file.message}`}
                              </span>
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
                                Remove
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
                          ? `Received by server, retained for a deselected requirement. ${file.message}`
                          : file.uploadStatus === "uploading"
                            ? "Uploading and extracting text…"
                            : `Upload failed. ${file.message}`}
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
                  <p>This preliminary document-readiness summary counts recommended document types with a successful upload and readable extracted text. It does not interpret legal relevance.</p>
                </div>
                <span className="demo-badge">INITIAL PROCESSING · NOT VERIFIED</span>
              </div>
              <div className="sample-alert" role="note">
                <span aria-hidden="true">ⓘ</span>
                <span><strong>Text extraction is not legal analysis.</strong> Extracting PDF text does not verify authenticity or establish whether a legal claim will succeed. A qualified legal professional must review the evidence. Scanned PDFs may have no extractable text; OCR is not performed.</span>
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
                  <h3>
                    {documentCompleteness === null
                      ? "Assessment unavailable"
                      : `${documentCompleteness}% · ${readableRecommendedDocuments.length}/${relevantDocuments.length} recommended document types readable`}
                  </h3>
                  <p className="result-body">
                    {documentCompleteness === null
                      ? "No recommended checklist was returned, so document completeness cannot be calculated."
                      : documentCompleteness === 100
                        ? "All recommended document types have at least one successful upload with readable extracted text. This does not assess legal relevance or sufficiency."
                        : "This preliminary score measures only uploaded checklist items with readable extracted text. It is not a case-strength score or a prediction of legal outcomes."}
                  </p>
                </article>
                <article className="result-card">
                  <div className="result-label">DOCUMENT READINESS DETAILS</div>
                  <p className="result-body"><strong>Available and readable:</strong> {readableRecommendedDocuments.length ? readableRecommendedDocuments.join("; ") : "None."}</p>
                  <p className="result-body"><strong>Missing readable documents:</strong> {missingRecommendedDocuments.length ? missingRecommendedDocuments.join("; ") : relevantDocuments.length ? "None." : "None recommended."}</p>
                  <p className="result-body"><strong>Uploaded but unreadable:</strong> {unreadableRecommendedDocuments.length ? unreadableRecommendedDocuments.join("; ") : "None."}</p>
                  <p className="result-body">The checklist is preliminary, and text extraction does not verify authenticity. A qualified legal professional must review the evidence.</p>
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
              <div className="result-label">CATEGORY AND EXPLANATION</div>
              <p className="result-body"><strong>Identified issue:</strong> {issueAnalysis?.identifiedIssue ?? "No classification returned."}</p>
              <p className="result-body"><strong>Legal category:</strong> <span className="category-tag">{issueAnalysis?.category ?? "Unclear / unsupported"}</span></p>
              <p className="result-body">{issueAnalysis?.explanation}</p>
              <p className="result-body"><strong>Suggested documents:</strong> {issueAnalysis?.requiredDocuments.length ? issueAnalysis.requiredDocuments.join("; ") : "The demo did not identify a document checklist."}</p>
            </article>
            <article className="result-card result-wide">
              <div className="result-label">DOCUMENTS RECEIVED AND STILL MISSING</div>
              <p className="result-body"><strong>Document completeness:</strong> {documentCompleteness === null ? "Assessment unavailable." : `${documentCompleteness}% (${readableRecommendedDocuments.length}/${relevantDocuments.length} recommended document types uploaded and readable).`}</p>
              <p className="result-body"><strong>Available and readable:</strong> {readableRecommendedDocuments.length ? readableRecommendedDocuments.join("; ") : "None."}</p>
              <p className="result-body"><strong>Missing readable documents:</strong> {missingRecommendedDocuments.length ? missingRecommendedDocuments.join("; ") : relevantDocuments.length ? "None." : "None recommended."}</p>
              <p className="result-body"><strong>Uploaded but unreadable:</strong> {unreadableRecommendedDocuments.length ? unreadableRecommendedDocuments.join("; ") : "None."}</p>
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
