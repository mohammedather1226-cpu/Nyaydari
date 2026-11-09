"use client";

import { ChangeEvent, useState } from "react";

export default function PdfSummaryPage() {
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const isPdf =
      file.type === "application/pdf" ||
      (!file.type && file.name.toLowerCase().endsWith(".pdf"));
    if (!isPdf) {
      setFilename("");
      setError("Please choose a PDF file. Other file types are not supported.");
      event.target.value = "";
      return;
    }
    setError("");
    setFilename(file.name);
  };

  return (
    <div className="page-shell pdf-page">
      <div className="page-intro">
        <div className="eyebrow"><span /> DOCUMENT ASSISTANCE</div>
        <h1>Make sense of a legal document.</h1>
        <p>
          Get a plain-language summary of what matters. PDF processing is not
          connected yet—this is a preview of what&apos;s to come.
        </p>
      </div>
      <section className="pdf-workspace">
        <div className="pdf-main">
          <div className="panel-heading">
            <div className="step-number">01</div>
            <div><h2>Choose a PDF to get started</h2><p>Your file stays on this page and is not sent anywhere.</p></div>
          </div>
          <label className="pdf-dropzone">
            <input type="file" accept="application/pdf,.pdf" onChange={handleFile} />
            <span className="pdf-upload-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7 9m5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></svg>
            </span>
            <strong>Click to choose a file</strong>
            <span>PDF only · Choose a document from your device</span>
            <span className="browse-button">Browse files</span>
          </label>
          {error && <p className="field-error pdf-error" role="alert">{error}</p>}
          {filename && (
            <div className="selected-file">
              <span className="file-type-icon">PDF</span>
              <span className="selected-file-name"><strong>{filename}</strong><small>Selected on this device · Not uploaded</small></span>
              <button className="remove-file" type="button" onClick={() => setFilename("")} aria-label="Remove selected PDF">×</button>
            </div>
          )}
          <div className="privacy-note"><span aria-hidden="true">⌑</span><span><strong>Your document stays yours.</strong> File selection is local to this browser prototype. No upload or processing takes place.</span></div>
        </div>
        <aside className="pdf-aside">
          <div className="result-label">YOUR SUMMARY</div>
          <div className="summary-placeholder">
            <span className="summary-icon" aria-hidden="true">▤</span>
            <strong>{filename ? "Summary preview" : "Your summary will appear here"}</strong>
            <p>{filename ? "PDF processing will be integrated later. No summary has been generated." : "Choose a PDF to see where your plain-language summary will appear."}</p>
          </div>
          {filename && <div className="summary-status"><span /> Processing not available yet</div>}
          <div className="coming-integration"><span>COMING NEXT</span><p>Document processing and summary generation will be integrated in a future version.</p></div>
        </aside>
      </section>
      <div className="pdf-disclaimer"><span aria-hidden="true">ⓘ</span><p><strong>Important:</strong> This prototype does not read or summarize your PDF. Any future summary will be general information and not legal advice. Please consult a qualified legal professional about your situation.</p></div>
    </div>
  );
}
