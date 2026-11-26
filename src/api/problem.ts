/** One incorrect field of a request. */
export interface FieldError {
  field: string;
  code: string;
  message: string;
}

/**
 * Problem details of an API error (RFC 9457).
 * The names follow `lib/errors.tsp` of constellation-contracts.
 */
export interface Problem {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  instance?: string;
  requestId?: string;
  traceId?: string;
  errors?: FieldError[];
  missingScopes?: string[];
}

const FALLBACK_CODE = 'request_failed';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True if the value is an object with a string `title`, a number `status`, and a string `code`. */
export function isProblem(value: unknown): value is Problem {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.status === 'number' &&
    typeof value.code === 'string'
  );
}

/** Make a general problem. It has no body text. */
export function fallbackProblem(status: number): Problem {
  return { type: 'about:blank', title: 'Request failed', status, code: FALLBACK_CODE };
}

function readFieldErrors(value: unknown): FieldError[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: FieldError[] = [];
  for (const item of value) {
    if (
      isRecord(item) &&
      typeof item.field === 'string' &&
      typeof item.code === 'string' &&
      typeof item.message === 'string'
    ) {
      result.push({ field: item.field, code: item.code, message: item.message });
    }
  }
  return result;
}

function readScopes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

/** Read a `Response` and return a `Problem`. It never throws for a bad body. */
export async function parseProblem(response: Response): Promise<Problem> {
  const status = response.status;
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  const isProblemJson = contentType.includes('application/problem+json');
  const isJson = contentType.includes('application/json');
  if (!isProblemJson && !isJson) return fallbackProblem(status);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return fallbackProblem(status);
  }
  if (!isRecord(body)) return fallbackProblem(status);
  if (!isProblemJson && !(typeof body.title === 'string' && typeof body.status === 'number')) {
    return fallbackProblem(status);
  }

  const problem: Problem = {
    type: typeof body.type === 'string' ? body.type : 'about:blank',
    title: typeof body.title === 'string' ? body.title : 'Request failed',
    status,
    code: typeof body.code === 'string' ? body.code : FALLBACK_CODE,
  };
  if (typeof body.detail === 'string') problem.detail = body.detail;
  if (typeof body.instance === 'string') problem.instance = body.instance;
  if (typeof body.requestId === 'string') problem.requestId = body.requestId;
  if (typeof body.traceId === 'string') problem.traceId = body.traceId;
  const errors = readFieldErrors(body.errors);
  if (errors) problem.errors = errors;
  const scopes = readScopes(body.missingScopes);
  if (scopes) problem.missingScopes = scopes;
  return problem;
}
