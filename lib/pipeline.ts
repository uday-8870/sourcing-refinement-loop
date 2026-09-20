import fs from "fs";
import path from "path";
import { ProfileSchema, type Filters, type Rubric, type Profile } from "./schemas";
import { applyFilters } from "./filter";
import { scoreProfiles } from "./llm";

let cachedProfiles: Profile[] | null = null;

export function loadProfiles(): Profile[] {
  if (cachedProfiles) return cachedProfiles;
  const raw = fs.readFileSync(path.join(process.cwd(), "data", "profiles.json"), "utf-8");
  const parsed = JSON.parse(raw);
  cachedProfiles = ProfileSchema.array().parse(parsed);
  return cachedProfiles;
}

export type SearchResult = {
  matchedCount: number;
  ranked: { profile: Profile; score: number; justification: string }[];
};

const TOP_N = 5;

/**
 * Filters the full profile set against the objective filters, then — if
 * anything matched — asks the LLM to score the filtered set against the
 * subjective rubric and returns the top N. Short-circuits with an empty
 * result (no LLM call) when nothing passes the objective filters, since
 * there's nothing meaningful to score or rank.
 */
export async function runSearch(filters: Filters, rubric: Rubric): Promise<SearchResult> {
  const all = loadProfiles();
  const filtered = applyFilters(all, filters);

  if (filtered.length === 0) {
    return { matchedCount: 0, ranked: [] };
  }

  const { scores } = await scoreProfiles(rubric.summary, rubric.criteria, filtered);
  const byId = new Map(filtered.map((p) => [p.id, p]));

  const ranked = scores
    .map((s) => {
      const profile = byId.get(s.id);
      if (!profile) return null;
      return { profile, score: s.score, justification: s.justification };
    })
    .filter((x): x is { profile: Profile; score: number; justification: string } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N);

  return { matchedCount: filtered.length, ranked };
}
