import { z } from "zod";

/**
 * JSON-by-instruction helpers. The model is asked for a JSON object and nothing else; this file
 * pulls the object out of the reply (tolerating prose or code fences around it) and nudges the
 * result toward the schema before validation: enum spelling, numbers written as strings with
 * commas or dollar signs, missing optional fields. Anything still wrong fails zod validation and
 * the caller retries once, so this is leniency about formatting, never about content.
 */

/** The first balanced {...} object in a text, or null. */
export function extractJsonObject(text: string): unknown | null {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Recursively coerces `value` toward `schema` without changing meaning. */
export function normalizeForSchema(value: unknown, schema: z.ZodType): unknown {
  if (schema instanceof z.ZodNullable) {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" && value.trim() === "" && !(schema.unwrap() instanceof z.ZodString)) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    if (typeof value === "string" && /^(null|none|n\/a|not stated|unknown)$/i.test(value.trim()) && !(schema.unwrap() instanceof z.ZodEnum)) return null;
    const inner = normalizeForSchema(value, schema.unwrap());
    return inner === undefined ? null : inner;
  }
  if (schema instanceof z.ZodOptional) {
    return value === undefined || value === null ? undefined : normalizeForSchema(value, schema.unwrap());
  }
  if (schema instanceof z.ZodObject) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const out: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(schema.shape as Record<string, z.ZodType>)) {
      out[key] = normalizeForSchema(source[key], field);
    }
    return out;
  }
  if (schema instanceof z.ZodArray) {
    if (!Array.isArray(value)) return value === null || value === undefined || value === "" ? [] : [normalizeForSchema(value, schema.element as z.ZodType)];
    return value.map((v) => normalizeForSchema(v, schema.element as z.ZodType)).filter((v) => v !== undefined);
  }
  if (schema instanceof z.ZodEnum) {
    const options = schema.options as string[];
    if (typeof value !== "string") return fallbackEnum(options);
    const key = value.trim().toLowerCase().replace(/[\s/-]+/g, "_");
    if (options.includes(value)) return value;
    const hit = options.find((o) => o.toLowerCase() === key);
    if (hit) return hit;
    const partial = options.find((o) => key.includes(o.toLowerCase()) || o.toLowerCase().includes(key));
    return partial ?? fallbackEnum(options);
  }
  if (schema instanceof z.ZodNumber) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
      const n = Number(value.replace(/[$,%\s]/g, ""));
      return Number.isFinite(n) && value.trim() !== "" ? n : null;
    }
    return null;
  }
  if (schema instanceof z.ZodBoolean) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return /^(true|yes|y|1)$/i.test(value.trim());
    return Boolean(value);
  }
  if (schema instanceof z.ZodString) {
    if (value === null || value === undefined) return "";
    return typeof value === "string" ? value : String(value);
  }
  return value;
}

function fallbackEnum(options: string[]): string {
  for (const candidate of ["other", "unknown", "unspecified", "low"]) if (options.includes(candidate)) return candidate;
  return options[0] ?? "";
}

/** A compact JSON Schema rendering for the prompt. */
export function schemaForPrompt(schema: z.ZodType): string {
  const json = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete json.$schema;
  return JSON.stringify(json);
}
