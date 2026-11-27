import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

interface AiChefV2RequestContext {
  requestId: string;
}

const requestContext = new AsyncLocalStorage<AiChefV2RequestContext>();

export function createAiChefV2RequestId(candidate?: string): string {
  if (candidate && /^[A-Za-z0-9._:-]{1,100}$/.test(candidate)) {
    return candidate;
  }
  return randomUUID();
}

export function getAiChefV2RequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

export function withAiChefV2RequestContext<T>(
  requestId: string,
  callback: () => T
): T {
  return requestContext.run({ requestId }, callback);
}

export function redactDiagnosticValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
      .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]")
      .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/gi, "[REDACTED_API_KEY]")
      .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_ACCESS_KEY]")
      .replace(/\b((?:postgres(?:ql)?|mysql):\/\/)[^:\s/@]+:[^@\s/]+@/gi, "$1[REDACTED]@")
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
      .replace(/\b\+?\d[\d\s().-]{7,}\d\b/g, "[REDACTED_PHONE]")
      .replace(/\b(password|secret|token|api[_-]?key|authorization)\s*[:=]\s*["']?[^\s,"'}]+/gi, "$1=[REDACTED]");
  }

  if (Array.isArray(value)) {
    return value.map(redactDiagnosticValue);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /password|secret|token|authorization|credential|api[_-]?key|email|phone|mobile|address|customer.?name|full.?name/i.test(key)
          ? "[REDACTED]"
          : redactDiagnosticValue(entry),
      ])
    );
  }

  return value;
}

export function logAiChefV2Event(
  event: string,
  fields: Record<string, unknown> = {},
  requestId = getAiChefV2RequestId() ?? "unavailable"
): void {
  console.info(
    JSON.stringify({
      ...fields,
      component: "ai-chef-v2",
      event,
      requestId,
      timestamp: new Date().toISOString(),
    })
  );
}

export function isAiChefV2Development(): boolean {
  return process.env.NODE_ENV === "development";
}
