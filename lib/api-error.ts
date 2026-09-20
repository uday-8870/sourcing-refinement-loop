import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { LLMError } from "./llm";

/**
 * Maps every failure mode the assignment calls out (rate limit, malformed
 * model output, timeout, and generic errors) to a stable JSON shape the UI
 * can branch on, plus a sensible HTTP status.
 */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof LLMError) {
    const status = err.kind === "rate_limit" ? 429 : err.kind === "timeout" ? 504 : 502;
    return NextResponse.json({ error: err.kind, message: err.message }, { status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "malformed", message: "Model output failed schema validation." },
      { status: 502 }
    );
  }
  console.error(err);
  return NextResponse.json(
    { error: "unknown", message: (err as Error)?.message ?? "Unexpected server error." },
    { status: 500 }
  );
}
