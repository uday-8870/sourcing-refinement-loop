# Sourcing Refinement Loop

A single-session AI recruiter sourcing loop: free text → objective filters +
subjective fit rubric → local filtering against `profiles.json` → LLM
scoring/ranking → conversational refinement → freeze.

## Setup

```bash
npm install
cp .env.example .env.local   # add your real GROQ_API_KEY
npm run dev
```

Open http://localhost:3000.

**Environment variables**
- `GROQ_API_KEY` — required. Get a free key at console.groq.com/keys. Used
  server-side only (in API routes), never sent to the client. The app calls
  `openai/gpt-oss-120b` on Groq's free tier.

**Data**: `data/profiles.json` ships with the real 48-record dataset from the
assignment.

## Architecture

- **Next.js App Router, single repo, one command to run.** API routes under
  `app/api/*` do all LLM calls server-side; the client never sees the API key.
- **Structured outputs**: every LLM call forces a single tool call via
  Groq's OpenAI-compatible function-calling API
  (`tool_choice: {type: "function", function: {name: ...}}`) with a JSON
  schema, then validates the parsed arguments against a matching Zod schema
  (`lib/schemas.ts`) before it's trusted anywhere else in the app. A schema
  mismatch is treated as a retryable "malformed" error, not silently coerced.
- **Prompts live in `prompts/*.md`** as plain templates with `{{VAR}}`
  placeholders, loaded and filled at request time by `lib/llm.ts`. Keeping
  them as files (not inline template strings) makes them easy to diff and
  iterate on independently of the calling code.
- **Local filtering (`lib/filter.ts`)** runs entirely in-process against the
  loaded JSON — no LLM call — since objective filters (skills, years,
  location, company type) are exact/checkable and doing this with the model
  would be slower, costlier, and less deterministic.
- **Scoring (`lib/pipeline.ts`)** only calls the LLM on the *already-filtered*
  subset, and short-circuits to an empty result with no LLM call at all if
  zero profiles pass the objective filters — there's nothing meaningful to
  rank, and it saves a request.
- **Direct editing (`app/api/rerun/route.ts`)**: the filters/rubric card is
  editable in place (skills, years range, locations, company type
  checkboxes, rubric text) per the brief's "read at a glance and edit
  directly" requirement. Applying an edit skips the extraction LLM call
  entirely — it's a direct, deterministic update to the filters/rubric
  object, then a normal filter+score pass — since there's nothing to
  interpret from free text here.
- **Refinement (`app/api/refine/route.ts`)** re-runs the same
  extract→filter→score pipeline with an updated filters/rubric pair, so the
  UI always renders through one code path regardless of whether it's an
  initial search or a refinement.
- **Robustness**: `lib/llm.ts` wraps every call with a 25s timeout, retries
  malformed/transient failures twice with backoff, and raises a distinct,
  stable error immediately on a 429 without burning retries. `lib/api-error.ts`
  maps these to HTTP status + a `{error, message}` body; the UI
  (`app/page.tsx`) branches on `error.error` to show a specific message for
  rate limits, timeouts, and malformed output, and a separate empty-state
  banner when zero candidates match the objective filters.

## Trade-offs (given the 3-hour timebox)

- **No persistence** — state lives in React state for the session, per the
  "single session" scope in the brief. A refresh loses progress; that's
  intentional, not an oversight.
- **Fuzzy substring matching for skills/location** rather than a normalized
  taxonomy (e.g. "RDS" matching "AWS RDS") — good enough for 48 profiles,
  would need a real skill taxonomy/embedding match at scale.
- **Refinement re-scores the whole filtered set** rather than incrementally
  patching scores, to keep one code path and one source of truth for
  ranking. Fine at this data size; would need to be smarter (e.g. only
  re-score profiles the rubric change plausibly affects) at scale.
- **One retry policy for all LLM calls** (timeout, malformed-output retry,
  immediate rate-limit surfacing) rather than per-endpoint tuning, to keep
  the robustness logic in one place (`lib/llm.ts`) given the time budget.
- **No auth/rate-limiting on the API routes themselves** — out of scope for
  a local single-user demo.

- **Open-weight model tool-calling** (GPT-OSS 120B via Groq) is less
  consistent at strict structured output than a frontier closed model —
  this is exactly why every call is schema-validated and retried on
  malformed output rather than trusted directly, and why `temperature` is
  kept low (0.2) for the structured calls.

## Prompt files

- `prompts/extract_filters.md` — free text → filters + rubric
- `prompts/score_profiles.md` — rubric-based scoring of the filtered set
- `prompts/refine.md` — recruiter feedback → updated filters + rubric
