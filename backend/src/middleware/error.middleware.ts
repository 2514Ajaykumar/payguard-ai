import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

/**
 * Sanitizes error messages by redacting API keys, credentials,
 * and internal filesystem paths.
 */
function sanitizeErrorString(str: string): string {
  if (!str || typeof str !== 'string') return str;

  let sanitized = str;

  // 1. Redact configured Groq API key if present
  if (config.groqApiKey && config.groqApiKey.length > 5) {
    sanitized = sanitized.split(config.groqApiKey).join('[REDACTED_API_KEY]');
  }

  // 2. Redact pattern-matching Groq keys (gsk_...)
  sanitized = sanitized.replace(/gsk_[a-zA-Z0-9_-]+/g, '[REDACTED_API_KEY]');

  // 3. Redact configured PayPal secret if present
  if (config.paypalClientSecret && config.paypalClientSecret.length > 5) {
    sanitized = sanitized.split(config.paypalClientSecret).join('[REDACTED_SECRET]');
  }

  // 4. Redact configured Tavily API key if present
  if (config.tavilyApiKey && config.tavilyApiKey.length > 5) {
    sanitized = sanitized.split(config.tavilyApiKey).join('[REDACTED_TAVILY_KEY]');
  }

  // 5. Redact pattern-matching Tavily keys (tvly-...)
  sanitized = sanitized.replace(/tvly-[a-zA-Z0-9_-]+/g, '[REDACTED_TAVILY_KEY]');

  // 4. Redact authorization headers or bearer tokens
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9_.\-]+/gi, 'Bearer [REDACTED_TOKEN]');

  // 5. Redact Windows filesystem paths (e.g., C:\Users\... or C:/Users/...), including paths with spaces
  sanitized = sanitized.replace(/[a-zA-Z]:[\\/](?:[\w\-.\s]+[\\/])*[\w\-.]+/g, '[REDACTED_PATH]');

  // 6. Redact Unix/POSIX absolute filesystem paths, including paths with spaces
  sanitized = sanitized.replace(/(?:^|[\s'"(])\/(?:Users|home|root|var|etc|opt|tmp|usr|app)(?:[\\/][\w\-.\s]+)*[\\/][\w\-.]+/g, ' [REDACTED_PATH]');

  return sanitized;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const isProd = config.nodeEnv === 'production';
  const debugId = (err as any).debugId;
  const errorName = (err as any).errorName;

  // Mask generic internal 500 server errors in production to avoid leaking unexpected exceptions
  let rawMessage = err.message || 'Internal Server Error';
  if (isProd && statusCode === 500 && !err.code) {
    rawMessage = 'An internal server error occurred.';
  }

  const sanitizedMessage = sanitizeErrorString(rawMessage);

  // Safe server-side console logging (sanitized of sensitive keys and paths)
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, sanitizedMessage);

  // Sanitize details if present
  let safeDetails: unknown = undefined;
  if (err.details !== undefined) {
    safeDetails = typeof err.details === 'string'
      ? sanitizeErrorString(err.details)
      : err.details;
  }

  // Production and API responses must NEVER expose stack traces, credentials, or filesystem paths
  res.status(statusCode).json({
    success: false,
    error: {
      message: sanitizedMessage,
      code: errorName || err.code || 'INTERNAL_ERROR',
      ...(debugId ? { debugId } : {}),
      ...(safeDetails !== undefined ? { details: safeDetails } : {}),
    },
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: {
      message: `Resource not found: ${req.method} ${req.originalUrl}`,
      code: 'NOT_FOUND',
    },
  });
};
