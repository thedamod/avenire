import * as Cause from "effect/Cause";

/** Keep nested errors and stack frames, without request objects, SQL parameters or signed URLs. */
export const prettyWorkerCause = (cause: Cause.Cause<unknown>): string =>
  Cause.pretty(cause)
    .replace(/\b(?:https?|postgres(?:ql)?):\/\/[^\s)]+/gi, "[redacted URL]")
    .replace(/^.*\b(?:params|parameters):.*$/gim, "[redacted parameters]")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(
      /(["']?(?:authorization|cookie|password|secret|token|api[_-]?key)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi,
      "$1[redacted]",
    );
