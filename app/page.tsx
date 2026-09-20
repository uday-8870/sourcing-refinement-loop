"use client";

import { useState } from "react";

type Filters = {
  skills: string[];
  min_years_experience: number | null;
  max_years_experience: number | null;
  locations: string[];
  company_types: string[];
};
type Rubric = { summary: string; criteria: string[] };
type RankedItem = {
  profile: { id: string; name: string; current_title: string; current_company: string };
  score: number;
  justification: string;
};
type ApiError = { error: "rate_limit" | "timeout" | "malformed" | "unknown"; message: string };

const ERROR_COPY: Record<ApiError["error"], string> = {
  rate_limit: "The LLM API is rate-limiting us right now. Wait a few seconds and try again.",
  timeout: "The request timed out waiting on the model. Try again.",
  malformed: "The model returned output that didn't match the expected schema. Try again.",
  unknown: "Something went wrong on the server.",
};

const COMPANY_TYPES = ["startup", "scaleup", "enterprise", "agency"] as const;

export default function Page() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<"filters" | "scoring" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const [filters, setFilters] = useState<Filters | null>(null);
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [matchedCount, setMatchedCount] = useState<number | null>(null);
  const [ranked, setRanked] = useState<RankedItem[]>([]);
  const [explanation, setExplanation] = useState<string | null>(null);

  const [feedbackText, setFeedbackText] = useState("");
  const [signals, setSignals] = useState<Record<string, "yes" | "no">>({});
  const [frozen, setFrozen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // --- Direct-edit draft state for the filters/rubric card ---
  const [editing, setEditing] = useState(false);
  const [draftSkills, setDraftSkills] = useState("");
  const [draftMinYears, setDraftMinYears] = useState("");
  const [draftMaxYears, setDraftMaxYears] = useState("");
  const [draftLocations, setDraftLocations] = useState("");
  const [draftCompanyTypes, setDraftCompanyTypes] = useState<string[]>([]);
  const [draftRubricSummary, setDraftRubricSummary] = useState("");
  const [draftRubricCriteria, setDraftRubricCriteria] = useState("");

  function syncDrafts(f: Filters, r: Rubric) {
    setDraftSkills(f.skills.join(", "));
    setDraftMinYears(f.min_years_experience?.toString() ?? "");
    setDraftMaxYears(f.max_years_experience?.toString() ?? "");
    setDraftLocations(f.locations.join(", "));
    setDraftCompanyTypes(f.company_types);
    setDraftRubricSummary(r.summary);
    setDraftRubricCriteria(r.criteria.join("\n"));
  }

  function applyResult(data: {
    filters: Filters;
    rubric: Rubric;
    matchedCount: number;
    ranked: RankedItem[];
    explanation?: string;
  }) {
    setFilters(data.filters);
    setRubric(data.rubric);
    setMatchedCount(data.matchedCount);
    setRanked(data.ranked);
    setExplanation(data.explanation ?? null);
    setSignals({});
    syncDrafts(data.filters, data.rubric);
  }

  async function callApi(path: string, body: unknown, stage: "filters" | "scoring") {
    setLoading(true);
    setLoadingStage(stage);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data as ApiError);
        return;
      }
      applyResult(data);
    } catch {
      setError({ error: "unknown", message: "Network error reaching the server." });
    } finally {
      setLoading(false);
      setLoadingStage(null);
    }
  }

  async function handleSearch() {
    if (!query.trim()) return;
    setHasSearched(true);
    await callApi("/api/search", { query }, "filters");
  }

  async function handleRefine() {
    if (!filters || !rubric) return;
    await callApi(
      "/api/refine",
      {
        currentFilters: filters,
        currentRubric: rubric,
        shortlist: ranked.map((r) => ({
          id: r.profile.id,
          name: r.profile.name,
          score: r.score,
          justification: r.justification,
        })),
        feedbackText,
        signals,
      },
      "filters"
    );
    setFeedbackText("");
  }

  async function handleApplyEdits() {
    const editedFilters: Filters = {
      skills: draftSkills.split(",").map((s) => s.trim()).filter(Boolean),
      min_years_experience: draftMinYears.trim() === "" ? null : Number(draftMinYears),
      max_years_experience: draftMaxYears.trim() === "" ? null : Number(draftMaxYears),
      locations: draftLocations.split(",").map((s) => s.trim()).filter(Boolean),
      company_types: draftCompanyTypes,
    };
    const editedRubric: Rubric = {
      summary: draftRubricSummary,
      criteria: draftRubricCriteria.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    setEditing(false);
    await callApi("/api/rerun", { filters: editedFilters, rubric: editedRubric }, "scoring");
  }

  function toggleSignal(id: string, value: "yes" | "no") {
    setSignals((prev) => ({ ...prev, [id]: prev[id] === value ? (undefined as unknown as "yes" | "no") : value }));
  }

  function toggleDraftCompanyType(t: string) {
    setDraftCompanyTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  const canRefine = !!filters && !!rubric && !frozen && !loading;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Sourcing Refinement Loop</h1>
      <p className="mt-1 text-sm text-slate-400">
        Describe the candidate you want, the way you'd type a search. The model turns it into filters
        and a fit rubric, then ranks matches against your 48-profile talent pool.
      </p>

      {!hasSearched && (
        <p className="mt-6 text-xs text-slate-500">
          Try: &ldquo;RDS developers with 4–7 years experience at startups in Bangalore&rdquo;
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
          placeholder='e.g. "RDS developers with 4-7 years experience at startups in Bangalore"'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={frozen || loading}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium disabled:opacity-40"
          onClick={handleSearch}
          disabled={frozen || loading || !query.trim()}
        >
          Search
        </button>
      </div>

      {loading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
          {loadingStage === "filters" && !filters
            ? "Reading your request, drafting filters and a fit rubric…"
            : "Scoring candidates against the rubric…"}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-200">
          {ERROR_COPY[error.error]}
        </div>
      )}

      {explanation && (
        <div className="mt-4 rounded-md border border-indigo-700 bg-indigo-950 px-3 py-2 text-sm text-indigo-200">
          <span className="font-medium">Refinement: </span>
          {explanation}
        </div>
      )}

      {filters && rubric && (
        <section className="mt-6 rounded-md border border-slate-800 bg-slate-900/50 p-4 text-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{frozen ? "Frozen filters" : "Current filters"}</h2>
            <div className="flex items-center gap-3">
              {matchedCount !== null && (
                <span className="text-slate-400">{matchedCount} matched objective filters</span>
              )}
              {!frozen && !editing && (
                <button className="text-xs text-indigo-400 hover:underline" onClick={() => setEditing(true)}>
                  Edit
                </button>
              )}
            </div>
          </div>

          {!editing ? (
            <>
              <dl className="mt-2 grid grid-cols-2 gap-y-1 text-slate-300">
                <dt className="text-slate-500">Skills</dt>
                <dd>{filters.skills.join(", ") || "—"}</dd>
                <dt className="text-slate-500">Experience</dt>
                <dd>
                  {filters.min_years_experience ?? "0"}–{filters.max_years_experience ?? "∞"} yrs
                </dd>
                <dt className="text-slate-500">Locations</dt>
                <dd>{filters.locations.join(", ") || "Any"}</dd>
                <dt className="text-slate-500">Company type</dt>
                <dd>{filters.company_types.join(", ") || "Any"}</dd>
              </dl>
              <h3 className="mt-3 font-medium">Fit rubric</h3>
              <p className="text-slate-300">{rubric.summary}</p>
              <ul className="mt-1 list-disc pl-5 text-slate-300">
                {rubric.criteria.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </>
          ) : (
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-slate-500">Skills (comma-separated)</span>
                <input
                  className="mt-1 w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                  value={draftSkills}
                  onChange={(e) => setDraftSkills(e.target.value)}
                />
              </label>
              <div className="flex gap-3">
                <label className="flex-1">
                  <span className="text-slate-500">Min years</span>
                  <input
                    type="number"
                    className="mt-1 w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                    value={draftMinYears}
                    onChange={(e) => setDraftMinYears(e.target.value)}
                  />
                </label>
                <label className="flex-1">
                  <span className="text-slate-500">Max years</span>
                  <input
                    type="number"
                    className="mt-1 w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                    value={draftMaxYears}
                    onChange={(e) => setDraftMaxYears(e.target.value)}
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-slate-500">Locations (comma-separated)</span>
                <input
                  className="mt-1 w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                  value={draftLocations}
                  onChange={(e) => setDraftLocations(e.target.value)}
                />
              </label>
              <div>
                <span className="text-slate-500">Company type</span>
                <div className="mt-1 flex gap-3">
                  {COMPANY_TYPES.map((t) => (
                    <label key={t} className="flex items-center gap-1 text-slate-300">
                      <input
                        type="checkbox"
                        checked={draftCompanyTypes.includes(t)}
                        onChange={() => toggleDraftCompanyType(t)}
                      />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="text-slate-500">Rubric summary</span>
                <textarea
                  className="mt-1 w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                  rows={2}
                  value={draftRubricSummary}
                  onChange={(e) => setDraftRubricSummary(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-slate-500">Rubric criteria (one per line)</span>
                <textarea
                  className="mt-1 w-full rounded bg-slate-950 border border-slate-700 px-2 py-1"
                  rows={4}
                  value={draftRubricCriteria}
                  onChange={(e) => setDraftRubricCriteria(e.target.value)}
                />
              </label>
              <div className="flex gap-2">
                <button
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                  onClick={handleApplyEdits}
                  disabled={loading}
                >
                  Apply & re-run
                </button>
                <button
                  className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium"
                  onClick={() => {
                    setEditing(false);
                    syncDrafts(filters, rubric);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {hasSearched && !loading && matchedCount === 0 && !error && (
        <div className="mt-4 rounded-md border border-amber-700 bg-amber-950 px-3 py-2 text-sm text-amber-200">
          No candidates matched the objective filters. Try loosening skills, experience range, or location —
          you can edit them directly above.
        </div>
      )}

      {ranked.length > 0 && (
        <section className="mt-6 space-y-3">
          <h2 className="text-sm font-medium text-slate-300">Top matches</h2>
          {ranked.map((r, i) => (
            <div key={r.profile.id} className="rounded-md border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">
                    {i + 1}. {r.profile.name}{" "}
                    <span className="text-slate-500 font-normal">
                      — {r.profile.current_title} @ {r.profile.current_company}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-300">{r.justification}</p>
                </div>
                <div className="ml-3 flex shrink-0 items-center gap-2">
                  <span className="rounded bg-slate-800 px-2 py-1 text-xs">{r.score}</span>
                  {!frozen && (
                    <>
                      <button
                        className={`rounded px-2 py-1 text-xs ${
                          signals[r.profile.id] === "yes" ? "bg-emerald-700" : "bg-slate-800"
                        }`}
                        onClick={() => toggleSignal(r.profile.id, "yes")}
                      >
                        👍
                      </button>
                      <button
                        className={`rounded px-2 py-1 text-xs ${
                          signals[r.profile.id] === "no" ? "bg-red-800" : "bg-slate-800"
                        }`}
                        onClick={() => toggleSignal(r.profile.id, "no")}
                      >
                        👎
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {canRefine && ranked.length > 0 && (
        <section className="mt-6 space-y-2">
          <textarea
            className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
            rows={2}
            placeholder='e.g. "1 is too junior, 2 and 4 are right"'
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium disabled:opacity-40"
              onClick={handleRefine}
              disabled={loading || (!feedbackText.trim() && Object.keys(signals).length === 0)}
            >
              {loading ? "Refining…" : "Submit feedback & re-rank"}
            </button>
            <button
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium"
              onClick={() => setFrozen(true)}
            >
              Freeze search
            </button>
          </div>
        </section>
      )}

      {frozen && (
        <div className="mt-4 rounded-md border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm text-emerald-200">
          Search frozen. The filters, rubric, and shortlist above are final for this session.
        </div>
      )}
    </main>
  );
}
