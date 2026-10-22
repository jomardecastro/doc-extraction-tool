/**
 * Error codes shared by the API and the UI. The backend sends `{ code, message, retryable }`;
 * the frontend maps `code` to its own copy and decides whether to show a retry button.
 */
export const ERROR_CODES = [
  "invalid_file_type",
  "file_too_large",
  "encrypted_pdf",
  "no_text_layer",
  "unreadable_text",
  "pdf_parse_failed",
  "document_too_long",
  "llm_auth",
  "llm_rate_limited",
  "llm_overloaded",
  "llm_refused",
  "llm_invalid_output",
  "budget_exceeded",
  "queue_full",
  "job_timeout",
  "job_not_found",
  "server_restarted",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

/** Default user-facing copy. The API may override `message` with a more specific sentence. */
export const ERROR_DEFAULTS: Record<
  ErrorCode,
  { message: string; retryable: boolean; status: number }
> = {
  invalid_file_type: { message: "Only PDF files are accepted.", retryable: false, status: 415 },
  file_too_large: {
    message: "The file is larger than the upload limit.",
    retryable: false,
    status: 413,
  },
  encrypted_pdf: {
    message: "This PDF is password protected. Remove the password and try again.",
    retryable: false,
    status: 422,
  },
  no_text_layer: {
    message:
      "This PDF has no extractable text. It looks like a scanned document, and OCR is not supported.",
    retryable: false,
    status: 422,
  },
  unreadable_text: {
    message: "The text in this PDF could not be decoded reliably (unusual font encoding).",
    retryable: false,
    status: 422,
  },
  pdf_parse_failed: {
    message: "The file could not be read as a PDF.",
    retryable: false,
    status: 422,
  },
  document_too_long: {
    message: "This document is too long to process in one run.",
    retryable: false,
    status: 422,
  },
  llm_auth: {
    message:
      "The language model API key is missing or invalid. Set ANTHROPIC_API_KEY on the server.",
    retryable: false,
    status: 500,
  },
  llm_rate_limited: {
    message: "The language model is rate limiting requests. Try again in a minute.",
    retryable: true,
    status: 503,
  },
  llm_overloaded: {
    message: "The language model service is temporarily overloaded. Try again shortly.",
    retryable: true,
    status: 503,
  },
  llm_refused: {
    message: "The language model declined to process this document.",
    retryable: false,
    status: 422,
  },
  llm_invalid_output: {
    message: "The language model returned output that could not be parsed.",
    retryable: true,
    status: 502,
  },
  budget_exceeded: {
    message:
      "Today's processing budget has been used up. Precomputed samples still work; new documents can be processed tomorrow.",
    retryable: false,
    status: 429,
  },
  queue_full: {
    message: "Too many documents are waiting. Try again in a few minutes.",
    retryable: true,
    status: 429,
  },
  job_timeout: {
    message: "Processing took too long and was stopped.",
    retryable: true,
    status: 504,
  },
  job_not_found: {
    message: "That document was not found. It may have expired.",
    retryable: false,
    status: 404,
  },
  server_restarted: {
    message: "The server restarted while this document was processing. Upload it again.",
    retryable: true,
    status: 500,
  },
  internal: { message: "Something went wrong on the server.", retryable: true, status: 500 },
};
