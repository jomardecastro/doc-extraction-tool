import type {
  ApiError,
  ErrorCode,
  ExportFormat,
  HealthView,
  JobView,
  SampleInfo,
  UploadAccepted,
} from "@det/shared";
import { ERROR_DEFAULTS } from "@det/shared";

/** Thrown for any non-2xx response; carries the API's `{code, message, retryable}`. */
export class ApiRequestError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly status: number;
  constructor(status: number, body: ApiError) {
    super(body.message);
    this.name = "ApiRequestError";
    this.code = body.code;
    this.retryable = body.retryable;
    this.status = status;
  }
}

function networkError(): ApiRequestError {
  return new ApiRequestError(0, {
    code: "internal",
    message: "Could not reach the server. Check your connection and try again.",
    retryable: true,
  });
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw networkError();
  }
  if (!res.ok) throw new ApiRequestError(res.status, await parseError(res));
  return (await res.json()) as T;
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as Partial<ApiError>;
    if (body && typeof body.code === "string" && body.code in ERROR_DEFAULTS) {
      return {
        code: body.code as ErrorCode,
        message: body.message ?? ERROR_DEFAULTS[body.code as ErrorCode].message,
        retryable: body.retryable ?? false,
      };
    }
  } catch {
    // not JSON (nginx error page, for example)
  }
  if (res.status === 413)
    return {
      code: "file_too_large",
      message: ERROR_DEFAULTS.file_too_large.message,
      retryable: false,
    };
  if (res.status === 429)
    return {
      code: "queue_full",
      message: "Too many uploads right now. Try again in a few minutes.",
      retryable: true,
    };
  if (res.status === 502 || res.status === 503 || res.status === 504)
    return {
      code: "llm_overloaded",
      message: "The server is restarting or busy. Try again in a minute.",
      retryable: true,
    };
  return { code: "internal", message: `The server answered ${res.status}.`, retryable: true };
}

export interface UploadProgress {
  loaded: number;
  total: number;
  /** bytes per second, smoothed */
  rate: number;
}

/**
 * Multipart upload with progress. XHR rather than fetch because fetch has no upload progress
 * events, and a 100 MB file deserves a real progress bar.
 */
export function uploadDocument(
  file: File,
  options: { live?: boolean; onProgress?: (p: UploadProgress) => void; signal?: AbortSignal } = {},
): Promise<UploadAccepted> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file, file.name);
    const started = Date.now();
    let rate = 0;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const elapsed = (Date.now() - started) / 1000;
      const instant = elapsed > 0 ? e.loaded / elapsed : 0;
      rate = rate === 0 ? instant : rate * 0.7 + instant * 0.3;
      options.onProgress?.({ loaded: e.loaded, total: e.total, rate });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadAccepted);
        } catch {
          reject(
            new ApiRequestError(xhr.status, {
              code: "internal",
              message: "Unexpected response from the server.",
              retryable: true,
            }),
          );
        }
        return;
      }
      let body: ApiError | null = null;
      try {
        const parsed = JSON.parse(xhr.responseText) as Partial<ApiError>;
        if (parsed.code && parsed.code in ERROR_DEFAULTS)
          body = {
            code: parsed.code,
            message: parsed.message ?? ERROR_DEFAULTS[parsed.code].message,
            retryable: parsed.retryable ?? false,
          };
      } catch {
        // fall through
      }
      if (!body && xhr.status === 413)
        body = {
          code: "file_too_large",
          message: ERROR_DEFAULTS.file_too_large.message,
          retryable: false,
        };
      if (!body && xhr.status === 429)
        body = {
          code: "queue_full",
          message: "Too many uploads from this connection. Try again in a while.",
          retryable: true,
        };
      reject(
        new ApiRequestError(
          xhr.status,
          body ?? {
            code: "internal",
            message: `The server answered ${xhr.status}.`,
            retryable: true,
          },
        ),
      );
    };
    xhr.onerror = () => reject(networkError());
    xhr.onabort = () =>
      reject(
        new ApiRequestError(0, { code: "internal", message: "Upload cancelled.", retryable: true }),
      );
    options.signal?.addEventListener("abort", () => xhr.abort());
    xhr.open("POST", options.live ? "/api/documents?live=1" : "/api/documents");
    xhr.send(form);
  });
}

export const getJob = (id: string) => request<JobView>(`/api/documents/${encodeURIComponent(id)}`);
export const listSamples = () => request<SampleInfo[]>("/api/samples");
export const processSample = (id: string, live = false) =>
  request<UploadAccepted>(
    `/api/samples/${encodeURIComponent(id)}/process${live ? "?live=1" : ""}`,
    { method: "POST" },
  );
export const getHealth = () => request<HealthView>("/api/health");
export const exportUrl = (id: string, format: ExportFormat) =>
  `/api/documents/${encodeURIComponent(id)}/export?format=${format}`;
