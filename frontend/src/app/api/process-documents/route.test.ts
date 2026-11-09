import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { POST } from "./route.ts";

function createPdf(text: string) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const lastLine = lines.at(-1);
    if (lastLine && `${lastLine} ${word}`.length <= 65) {
      lines[lines.length - 1] = `${lastLine} ${word}`;
    } else {
      lines.push(word);
    }
  }
  const content = `BT /F1 12 Tf 72 720 Td ${lines
    .map(
      (line) =>
        `(${line.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")}) Tj T*`,
    )
    .join(" ")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function requestWithFiles(
  files: { name: string; bytes: Uint8Array; type?: string }[],
  documentTypes: string[],
  category = "rental_property",
) {
  const formData = new FormData();
  for (const file of files) {
    const bytes = new ArrayBuffer(file.bytes.byteLength);
    new Uint8Array(bytes).set(file.bytes);
    formData.append(
      "files",
      new File([bytes], file.name, { type: file.type ?? "application/pdf" }),
    );
  }
  for (const documentType of documentTypes) {
    formData.append("documentTypes", documentType);
  }
  formData.append("category", category);
  return new NextRequest("http://localhost/api/process-documents", {
    method: "POST",
    body: formData,
  });
}

test("processes a PDF and returns extracted and verification statuses separately", async () => {
  const response = await POST(
    requestWithFiles(
      [
        {
          name: "lease.pdf",
          bytes: createPdf(
            "Rental agreement between landlord and tenant. Property address 8 Main Road. Monthly rent and security deposit are listed.",
          ),
        },
      ],
      ["Rental or lease agreement"],
    ),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.files[0].status, "processed");
  assert.equal(payload.files[0].verificationStatus, "matched");
  assert.match(payload.files[0].verificationExplanation, /preliminary type match/i);
});

test("returns a type mismatch for a bank statement uploaded as a lease", async () => {
  const response = await POST(
    requestWithFiles(
      [
        {
          name: "bank.pdf",
          bytes: createPdf(
            "Bank statement for account number 1234. Statement period June. Opening balance 500, closing balance 300, debit and credit transactions.",
          ),
        },
      ],
      ["Rental or lease agreement"],
    ),
  );
  const payload = await response.json();

  assert.equal(payload.files[0].status, "processed");
  assert.equal(payload.files[0].verificationStatus, "mismatch");
});

test("processes different supported checklist documents in one request", async () => {
  const response = await POST(
    requestWithFiles(
      [
        {
          name: "lease.pdf",
          bytes: createPdf(
            "Rental agreement between landlord and tenant. Property address 8 Main Road. Monthly rent and security deposit are listed.",
          ),
        },
        {
          name: "deposit.pdf",
          bytes: createPdf(
            "Payment receipt. Transaction ID UPI-44. Amount paid: 20,000. Payment date: 4 June. Security deposit for rental property paid to landlord.",
          ),
        },
      ],
      [
        "Rental or lease agreement",
        "Rent and security-deposit payment records",
      ],
    ),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.files.length, 2);
  assert.deepEqual(
    payload.files.map((file: { verificationStatus: string }) => file.verificationStatus),
    ["matched", "matched"],
    JSON.stringify(payload.files),
  );
});

test("rejects a checklist item that does not belong to the submitted category", async () => {
  const response = await POST(
    requestWithFiles(
      [{ name: "lease.pdf", bytes: createPdf("Some PDF content") }],
      ["Rental or lease agreement"],
      "consumer",
    ),
  );

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /must belong/i);
});

test("rejects duplicate file content assigned more than once in a request", async () => {
  const bytes = createPdf("Same PDF content.");
  const response = await POST(
    requestWithFiles(
      [
        { name: "first.pdf", bytes },
        { name: "copy.pdf", bytes },
      ],
      ["Rental or lease agreement", "Rent and security-deposit payment records"],
    ),
  );

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /same pdf/i);
});

test("preserves PDF signature, file-size, and MIME validation", async () => {
  const invalidSignature = await POST(
    requestWithFiles(
      [{ name: "fake.pdf", bytes: new TextEncoder().encode("not a PDF") }],
      ["Rental or lease agreement"],
    ),
  );
  const invalidPayload = await invalidSignature.json();
  assert.equal(invalidPayload.files[0].uploadStatus, "rejected");
  assert.equal(invalidPayload.files[0].verificationStatus, "unreadable");

  const invalidMime = await POST(
    requestWithFiles(
      [
        {
          name: "wrong-mime.pdf",
          bytes: createPdf("valid PDF header"),
          type: "text/plain",
        },
      ],
      ["Rental or lease agreement"],
    ),
  );
  assert.equal((await invalidMime.json()).files[0].uploadStatus, "rejected");

  const oversized = await POST(
    requestWithFiles(
      [{ name: "large.pdf", bytes: new Uint8Array(10 * 1024 * 1024 + 1) }],
      ["Rental or lease agreement"],
    ),
  );
  assert.equal((await oversized.json()).files[0].error, "The file exceeds the 10 MB limit.");

  const tooManyFiles = await POST(
    requestWithFiles(
      Array.from({ length: 11 }, (_, index) => ({
        name: `invalid-${index}.pdf`,
        bytes: new TextEncoder().encode(`not a PDF ${index}`),
      })),
      Array.from({ length: 11 }, () => "Rental or lease agreement"),
    ),
  );
  assert.equal(tooManyFiles.status, 413);
});

test("marks text-free or corrupted PDFs unreadable without conflating extraction and verification", async () => {
  const emptyTextPdf = await POST(
    requestWithFiles(
      [{ name: "empty.pdf", bytes: createPdf("") }],
      ["Rental or lease agreement"],
    ),
  );
  const emptyPayload = await emptyTextPdf.json();
  assert.equal(
    emptyPayload.files[0].status,
    "unreadable",
    JSON.stringify(emptyPayload.files[0]),
  );
  assert.equal(emptyPayload.files[0].verificationStatus, "unreadable");

  const corrupted = await POST(
    requestWithFiles(
      [{ name: "corrupted.pdf", bytes: new TextEncoder().encode("%PDF-1.4\nbroken") }],
      ["Rental or lease agreement"],
    ),
  );
  const corruptedPayload = await corrupted.json();
  assert.equal(corruptedPayload.files[0].status, "error");
  assert.equal(corruptedPayload.files[0].verificationStatus, "unreadable");
});
