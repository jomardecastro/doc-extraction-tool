import { ERROR_DEFAULTS, type ApiError, type ErrorCode } from "@det/shared";

/**
 * The one error type the API surfaces. Anything else thrown inside the pipeline is wrapped as
 * `internal` at the route boundary so clients always get `{ code, message, retryable }`.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    message?: string,
    options: { cause?: unknown; retryable?: boolean; status?: number } = {},
  ) {
    const defaults = ERROR_DEFAULTS[code];
    super(
      message ?? defaults.message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? defaults.status;
    this.retryable = options.retryable ?? defaults.retryable;
  }

  toJSON(): ApiError {
    return { code: this.code, message: this.message, retryable: this.retryable };
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  return new AppError("internal", undefined, { cause: err });
}
