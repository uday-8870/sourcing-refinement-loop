import Groq from "groq-sdk";
import fs from "fs";
import path from "path";
import {
  ExtractionSchema,
  ScoringResultSchema,
  RefinementSchema,
  type Extraction,
  type ScoringResult,
  type Refinement,
} from "./schemas";

// openai/gpt-oss-120b: Groq's recommended replacement for the deprecated
// llama-3.3-70b-versatile (deprecated 2026-08-16), with reliable tool-calling
// and a free tier, per the assignment's LLM requirement.
const MODEL = "openai/gpt-oss-120b";
const TIMEOUT_MS = 25_000;
const MAX_RETRIES = 2;

// Lazily constructed so importing this module (e.g. during `next build`'s
// page-data collection) never throws just because the env var isn't set yet
// in that environment; the real failure surfaces as a normal API error the
// first time a route actually tries to call the model.
let _client: Groq | null = null;
function getClient(): Groq {
  if (!_client) _client = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });
  return _client;
}

function loadPrompt(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), "prompts", file), "utf-8");
}

function fill(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

// Errors surfaced to the UI with a stable `kind` so it can render the right
// empty/error state instead of a generic failure.
export class LLMError extends Error {
  kind: "rate_limit" | "timeout" | "malformed" | "unknown";
  constructor(kind: LLMError["kind"], message: string) {
    super(message);
    this.kind = kind;
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LLMError("timeout", "LLM call timed out")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Calls the Groq chat API with a single forced tool call so the response is
 * structured JSON, retries on transient/malformed failures, and validates
 * the result against the given Zod-backed parser before returning it.
 */
async function callStructured<T>(opts: {
  system?: string;
  userText: string;
  toolName: string;
  toolDescription: string;
  toolParameters: Record<string, unknown>;
  parse: (input: unknown) => T;
}): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [];
      if (opts.system) messages.push({ role: "system", content: opts.system });
      messages.push({ role: "user", content: opts.userText });

      const response = await withTimeout(
        getClient().chat.completions.create({
          model: MODEL,
          messages,
          temperature: 0.2,
          max_tokens: 2000,
          tools: [
            {
              type: "function",
              function: {
                name: opts.toolName,
                description: opts.toolDescription,
                parameters: opts.toolParameters,
              },
            },
          ],
          tool_choice: { type: "function", function: { name: opts.toolName } },
        }),
        TIMEOUT_MS
      );

      const toolCall = response.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall || toolCall.type !== "function") {
        throw new LLMError("malformed", "Model did not return a tool call");
      }
      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        throw new LLMError("malformed", "Model tool call arguments were not valid JSON");
      }
      return opts.parse(parsedArgs);
    } catch (err: unknown) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if (status === 429) {
        // Rate limited — surface immediately, don't burn remaining retries.
        throw new LLMError("rate_limit", "Groq API rate limit hit");
      }
      if (err instanceof LLMError && err.kind !== "malformed") throw err;
      // Malformed output or transient error: retry with backoff.
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        continue;
      }
    }
  }
  if (lastErr instanceof LLMError) throw lastErr;
  throw new LLMError("unknown", (lastErr as Error)?.message ?? "Unknown LLM error");
}

const FILTERS_PARAMETERS = {
  type: "object",
  properties: {
    filters: {
      type: "object",
      properties: {
        skills: { type: "array", items: { type: "string" } },
        min_years_experience: { type: ["number", "null"] },
        max_years_experience: { type: ["number", "null"] },
        locations: { type: "array", items: { type: "string" } },
        company_types: {
          type: "array",
          items: { type: "string", enum: ["startup", "scaleup", "enterprise", "agency"] },
        },
      },
      required: ["skills", "min_years_experience", "max_years_experience", "locations", "company_types"],
    },
    rubric: {
      type: "object",
      properties: {
        summary: { type: "string" },
        criteria: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "criteria"],
    },
  },
  required: ["filters", "rubric"],
};

export async function extractFiltersAndRubric(query: string): Promise<Extraction> {
  const template = loadPrompt("extract_filters.md");
  const userText = fill(template, { QUERY: query });
  return callStructured({
    userText,
    toolName: "emit_extraction",
    toolDescription: "Emit the structured objective filters and subjective fit rubric.",
    toolParameters: FILTERS_PARAMETERS,
    parse: (input) => ExtractionSchema.parse(input),
  });
}

const SCORES_PARAMETERS = {
  type: "object",
  properties: {
    scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          score: { type: "number" },
          justification: { type: "string" },
        },
        required: ["id", "score", "justification"],
      },
    },
  },
  required: ["scores"],
};

export async function scoreProfiles(
  rubricSummary: string,
  rubricCriteria: string[],
  profiles: unknown[]
): Promise<ScoringResult> {
  const template = loadPrompt("score_profiles.md");
  const userText = fill(template, {
    RUBRIC_SUMMARY: rubricSummary,
    RUBRIC_CRITERIA: rubricCriteria.map((c) => `- ${c}`).join("\n"),
    PROFILES_JSON: JSON.stringify(profiles, null, 2),
  });
  return callStructured({
    userText,
    toolName: "emit_scores",
    toolDescription: "Emit a fit score and justification for every candidate id provided.",
    toolParameters: SCORES_PARAMETERS,
    parse: (input) => ScoringResultSchema.parse(input),
  });
}

const REFINEMENT_PARAMETERS = {
  type: "object",
  properties: {
    filters: FILTERS_PARAMETERS.properties.filters,
    rubric: FILTERS_PARAMETERS.properties.rubric,
    explanation: { type: "string" },
  },
  required: ["filters", "rubric", "explanation"],
};

export async function refineFiltersAndRubric(args: {
  currentFilters: unknown;
  currentRubric: unknown;
  shortlist: unknown;
  feedbackText: string;
  signals: unknown;
}): Promise<Refinement> {
  const template = loadPrompt("refine.md");
  const userText = fill(template, {
    CURRENT_FILTERS_JSON: JSON.stringify(args.currentFilters, null, 2),
    CURRENT_RUBRIC_JSON: JSON.stringify(args.currentRubric, null, 2),
    SHORTLIST_JSON: JSON.stringify(args.shortlist, null, 2),
    FEEDBACK_TEXT: args.feedbackText || "(none — only explicit yes/no signals given)",
    SIGNALS_JSON: JSON.stringify(args.signals ?? {}, null, 2),
  });
  return callStructured({
    userText,
    toolName: "emit_refinement",
    toolDescription: "Emit the updated filters, updated rubric, and an explanation of the change.",
    toolParameters: REFINEMENT_PARAMETERS,
    parse: (input) => RefinementSchema.parse(input),
  });
}
