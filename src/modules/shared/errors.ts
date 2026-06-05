export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly retryable: boolean;

  constructor(
    message: string,
    options?: {
      code?: string;
      statusCode?: number;
      retryable?: boolean;
    },
  ) {
    super(message);
    this.name = "AppError";
    this.code = options?.code ?? "app_error";
    this.statusCode = options?.statusCode ?? 500;
    this.retryable = options?.retryable ?? false;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, code = "not_found") {
    super(message, { code, statusCode: 404, retryable: false });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = "conflict") {
    super(message, { code, statusCode: 409, retryable: false });
    this.name = "ConflictError";
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, code = "external_service_error", retryable = true) {
    super(message, { code, statusCode: 502, retryable });
    this.name = "ExternalServiceError";
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.retryable;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("econnreset") ||
      message.includes("enotfound") ||
      message.includes("temporar")
    );
  }

  return false;
}
