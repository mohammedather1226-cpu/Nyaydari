import { NextRequest, NextResponse } from "next/server";

const MAX_ISSUE_LENGTH = 5000;
const MAX_JURISDICTION_LENGTH = 200;
const BACKEND_TIMEOUT_MS = 15_000;

type ApiResponse = {
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

function isApiResponse(value: unknown): value is ApiResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;

  return (
    typeof response.success === "boolean" &&
    typeof response.demo === "boolean" &&
    (typeof response.originalIssue === "string" || response.originalIssue === null) &&
    (typeof response.jurisdiction === "string" || response.jurisdiction === null) &&
    (typeof response.category === "string" || response.category === null) &&
    (typeof response.identifiedIssue === "string" ||
      response.identifiedIssue === null) &&
    typeof response.explanation === "string" &&
    Array.isArray(response.requiredDocuments) &&
    response.requiredDocuments.every((item) => typeof item === "string") &&
    Array.isArray(response.nextSteps) &&
    response.nextSteps.every((item) => typeof item === "string") &&
    typeof response.disclaimer === "string" &&
    (typeof response.error === "string" || response.error === null)
  );
}

function jsonResponse(body: ApiResponse, status: number) {
  return NextResponse.json(body, { status });
}

function errorResponse(
  error: string,
  status: number,
  originalIssue: string | null = null,
  jurisdiction: string | null = null,
) {
  return jsonResponse(
    {
      success: false,
      demo: false,
      originalIssue,
      jurisdiction,
      category: null,
      identifiedIssue: null,
      explanation: "",
      requiredDocuments: [],
      nextSteps: [],
      disclaimer: "No analysis was generated.",
      error,
    },
    status,
  );
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return errorResponse("Content-Type must be application/json.", 415);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Request body must contain valid JSON.", 400);
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return errorResponse("Request body must be a JSON object.", 400);
  }

  const input = body as Record<string, unknown>;
  const issueValue = input.issue;
  if (typeof issueValue !== "string" || issueValue.trim().length === 0) {
    return errorResponse(
      "The issue field is required and must be a non-empty string.",
      400,
    );
  }

  const issue = issueValue.trim();
  if (issue.length > MAX_ISSUE_LENGTH) {
    return errorResponse(
      `The issue must be ${MAX_ISSUE_LENGTH} characters or fewer.`,
      413,
      issue.slice(0, MAX_ISSUE_LENGTH),
    );
  }

  const jurisdictionValue = input.jurisdiction;
  if (
    jurisdictionValue !== undefined &&
    jurisdictionValue !== null &&
    typeof jurisdictionValue !== "string"
  ) {
    return errorResponse(
      "The jurisdiction field must be a string when provided.",
      400,
      issue,
    );
  }

  const jurisdiction =
    typeof jurisdictionValue === "string" && jurisdictionValue.trim()
      ? jurisdictionValue.trim()
      : null;

  if (jurisdiction && jurisdiction.length > MAX_JURISDICTION_LENGTH) {
    return errorResponse(
      `The jurisdiction must be ${MAX_JURISDICTION_LENGTH} characters or fewer.`,
      400,
      issue,
      jurisdiction.slice(0, MAX_JURISDICTION_LENGTH),
    );
  }

  const backendApiUrl = process.env.BACKEND_API_URL;
  if (!backendApiUrl) {
    return errorResponse(
      "The analysis service is not configured.",
      503,
      issue,
      jurisdiction,
    );
  }

  let endpoint: URL;
  try {
    endpoint = new URL("/analyze", backendApiUrl);
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
      throw new Error("Unsupported backend URL protocol.");
    }
  } catch {
    return errorResponse(
      "The analysis service URL is invalid.",
      500,
      issue,
      jurisdiction,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);

  try {
    const backendResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issue,
        ...(jurisdiction ? { jurisdiction } : {}),
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    let responseBody: unknown;
    try {
      responseBody = await backendResponse.json();
    } catch {
      return errorResponse(
        "The analysis service returned an invalid response.",
        502,
        issue,
        jurisdiction,
      );
    }

    if (!isApiResponse(responseBody)) {
      return errorResponse(
        "The analysis service returned an unexpected response format.",
        502,
        issue,
        jurisdiction,
      );
    }

    const status = backendResponse.ok ? 200 : backendResponse.status;
    return jsonResponse(responseBody, status);
  } catch {
    if (controller.signal.aborted) {
      return errorResponse(
        "The analysis service timed out. Please try again.",
        504,
        issue,
        jurisdiction,
      );
    }

    return errorResponse(
      "The analysis service could not be reached. Please try again.",
      502,
      issue,
      jurisdiction,
    );
  } finally {
    clearTimeout(timeout);
  }
}
