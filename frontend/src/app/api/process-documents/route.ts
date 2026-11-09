import { PDFParse } from "pdf-parse";
import { NextRequest, NextResponse } from "next/server";

const MAX_FILE_COUNT = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_DOCUMENT_TYPE_LENGTH = 300;
const MAX_RETURNED_TEXT_LENGTH = 100_000;

type FileResult = {
  name: string;
  documentType: string | null;
  uploadStatus: "received" | "rejected";
  status: "processed" | "unreadable" | "error";
  extractedTextLength: number;
  extractedText: string | null;
  extractedTextTruncated: boolean;
  error: string | null;
};

type ApiResponse = {
  success: boolean;
  initialImplementation: true;
  files: FileResult[];
  error: string | null;
};

export const runtime = "nodejs";

function jsonResponse(body: ApiResponse, status: number) {
  return NextResponse.json(body, { status });
}

function fileResult(
  file: File,
  documentType: string | null,
  values: Partial<FileResult> & Pick<FileResult, "uploadStatus" | "status">,
): FileResult {
  return {
    name: file.name,
    documentType,
    uploadStatus: values.uploadStatus,
    status: values.status,
    extractedTextLength: values.extractedTextLength ?? 0,
    extractedText: values.extractedText ?? null,
    extractedTextTruncated: values.extractedTextTruncated ?? false,
    error: values.error ?? null,
  };
}

function hasPdfSignature(bytes: Uint8Array) {
  const header = new TextDecoder().decode(bytes.subarray(0, 1024));
  return header.includes("%PDF-");
}

async function processFile(file: File, documentType: string | null): Promise<FileResult> {
  if (file.size === 0) {
    return fileResult(file, documentType, {
      uploadStatus: "rejected",
      status: "error",
      error: "The file is empty.",
    });
  }
  if (file.size > MAX_FILE_SIZE) {
    return fileResult(file, documentType, {
      uploadStatus: "rejected",
      status: "error",
      error: "The file exceeds the 10 MB limit.",
    });
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (
    extension !== "pdf" ||
    (file.type !== "" && file.type !== "application/pdf")
  ) {
    return fileResult(file, documentType, {
      uploadStatus: "rejected",
      status: "error",
      error: "Unsupported file type. Only PDF files are accepted.",
    });
  }

  const data = new Uint8Array(await file.arrayBuffer());
  if (!hasPdfSignature(data)) {
    return fileResult(file, documentType, {
      uploadStatus: "rejected",
      status: "error",
      error: "The file does not contain a valid PDF header.",
    });
  }

  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data });
    const result = await parser.getText();
    const text = result.text;

    if (!text.trim()) {
      return fileResult(file, documentType, {
        uploadStatus: "received",
        status: "unreadable",
        error: "No text could be extracted. This may be a scanned or text-free PDF; OCR was not performed.",
      });
    }

    return fileResult(file, documentType, {
      uploadStatus: "received",
      status: "processed",
      extractedTextLength: text.length,
      extractedText: text.slice(0, MAX_RETURNED_TEXT_LENGTH),
      extractedTextTruncated: text.length > MAX_RETURNED_TEXT_LENGTH,
    });
  } catch (error) {
    console.error(
      "PDF text extraction failed:",
      error instanceof Error ? error.message : "Unknown parser error.",
    );
    return fileResult(file, documentType, {
      uploadStatus: "received",
      status: "error",
      error: "The PDF was received, but its text could not be extracted. It may be damaged or password-protected.",
    });
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch (error) {
        console.error(
          "PDF parser cleanup failed:",
          error instanceof Error ? error.message : "Unknown cleanup error.",
        );
      }
    }
  }
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0].trim().toLowerCase();
  if (mediaType !== "multipart/form-data") {
    return jsonResponse(
      {
        success: false,
        initialImplementation: true,
        files: [],
        error: "Content-Type must be multipart/form-data.",
      },
      415,
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse(
      {
        success: false,
        initialImplementation: true,
        files: [],
        error: "The multipart request could not be read.",
      },
      400,
    );
  }

  const fileEntries = formData.getAll("files");
  if (fileEntries.length === 0) {
    return jsonResponse(
      {
        success: false,
        initialImplementation: true,
        files: [],
        error: "At least one file is required in the 'files' field.",
      },
      400,
    );
  }
  if (fileEntries.length > MAX_FILE_COUNT) {
    return jsonResponse(
      {
        success: false,
        initialImplementation: true,
        files: [],
        error: `A maximum of ${MAX_FILE_COUNT} files is allowed per request.`,
      },
      413,
    );
  }
  if (!fileEntries.every((entry) => entry instanceof File)) {
    return jsonResponse(
      {
        success: false,
        initialImplementation: true,
        files: [],
        error: "Every value in the 'files' field must be a file.",
      },
      400,
    );
  }

  const files = fileEntries as File[];
  const documentTypeEntries = formData.getAll("documentTypes");
  if (
    documentTypeEntries.length > 0 &&
    (documentTypeEntries.length !== files.length ||
      !documentTypeEntries.every(
        (entry) =>
          typeof entry === "string" &&
          entry.trim().length > 0 &&
          entry.length <= MAX_DOCUMENT_TYPE_LENGTH,
      ))
  ) {
    return jsonResponse(
      {
        success: false,
        initialImplementation: true,
        files: [],
        error: "Provide one non-empty document type of at most 300 characters for each file.",
      },
      400,
    );
  }

  const documentTypes = documentTypeEntries.length
    ? (documentTypeEntries as string[]).map((value) => value.trim())
    : files.map(() => null);
  const results = await Promise.all(
    files.map((file, index) => processFile(file, documentTypes[index])),
  );
  const success = results.every(
    (result) =>
      result.uploadStatus === "received" &&
      result.status !== "error",
  );

  return jsonResponse(
    {
      success,
      initialImplementation: true,
      files: results,
      error: null,
    },
    200,
  );
}
