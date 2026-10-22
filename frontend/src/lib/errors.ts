import type { ApiError, ErrorCode } from "@det/shared";

export interface ErrorPresentation {
  title: string;
  detail: string;
  /** What the person can do next. */
  action: "upload_another" | "retry_upload" | "wait" | "none";
}

const TITLES: Partial<Record<ErrorCode, string>> = {
  invalid_file_type: "That file is not a PDF",
  file_too_large: "That file is too large",
  encrypted_pdf: "This PDF is password protected",
  no_text_layer: "This PDF has no readable text",
  unreadable_text: "The text in this PDF could not be decoded",
  pdf_parse_failed: "This file could not be read as a PDF",
  document_too_long: "This document is too long to process",
  llm_auth: "The extraction service is not configured",
  llm_rate_limited: "The extraction service is busy",
  llm_overloaded: "The extraction service is busy",
  llm_refused: "The extraction service declined this document",
  llm_invalid_output: "Extraction returned unusable data",
  budget_exceeded: "Today's processing budget is used up",
  queue_full: "Too many documents are waiting",
  job_timeout: "Processing took too long",
  job_not_found: "This document is no longer available",
  server_restarted: "The server restarted during processing",
  internal: "Something went wrong",
};

export function presentError(error: ApiError): ErrorPresentation {
  return { title: TITLES[error.code] ?? "Something went wrong", detail: error.message, action: actionFor(error.code) };
}

function actionFor(code: ErrorCode): ErrorPresentation["action"] {
  switch (code) {
    case "llm_rate_limited":
    case "llm_overloaded":
    case "queue_full":
    case "job_timeout":
    case "server_restarted":
    case "llm_invalid_output":
    case "internal":
      return "retry_upload";
    case "budget_exceeded":
      return "wait";
    case "llm_auth":
      return "none";
    default:
      return "upload_another";
  }
}
