/**
 * RFC 8785 JSON Canonicalization Scheme (JCS) Implementation
 * Guarantees deterministic serialization across TypeScript, Python, and Rust runtimes.
 *
 * Requirements per RFC 8785:
 * 1. Object keys sorted by UTF-16 code units.
 * 2. Numbers formatted according to ECMAScript JSON rules (no trailing .0, exponential when standard).
 * 3. Whitespace stripped completely.
 * 4. Strings escaped per standard JSON rules.
 * 5. Undefined, functions, and symbols ignored in objects; null preserved in arrays.
 */

export function canonicalizeJson(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return "null";
  }

  const type = typeof obj;

  if (type === "boolean" || type === "number") {
    // In JavaScript, JSON.stringify formats numbers exactly according to ES specification (RFC 8785 §3.2.2.3)
    if (typeof obj === "number" && (!Number.isFinite(obj))) {
      return "null";
    }
    return JSON.stringify(obj);
  }

  if (type === "bigint") {
    return (obj as bigint).toString();
  }

  if (type === "string") {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const serializedElements = obj.map((item) => {
      if (item === undefined || typeof item === "function" || typeof item === "symbol") {
        return "null";
      }
      return canonicalizeJson(item);
    });
    return `[${serializedElements.join(",")}]`;
  }

  if (type === "object") {
    // Array.prototype.sort() sorts strings in UTF-16 code unit order, which matches RFC 8785 §3.2.3
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const serializedEntries: string[] = [];

    for (const key of keys) {
      const value = (obj as Record<string, unknown>)[key];
      if (value !== undefined && typeof value !== "function" && typeof value !== "symbol") {
        const canonicalKey = JSON.stringify(key);
        const canonicalVal = canonicalizeJson(value);
        serializedEntries.push(`${canonicalKey}:${canonicalVal}`);
      }
    }

    return `{${serializedEntries.join(",")}}`;
  }

  return "";
}
