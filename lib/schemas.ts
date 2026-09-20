import { z } from "zod";

// --- Objective filters extracted from free text ---
export const FiltersSchema = z.object({
  skills: z.array(z.string()).default([]),
  min_years_experience: z.number().nullable().default(null),
  max_years_experience: z.number().nullable().default(null),
  locations: z.array(z.string()).default([]),
  company_types: z
    .array(z.enum(["startup", "scaleup", "enterprise", "agency"]))
    .default([]),
});
export type Filters = z.infer<typeof FiltersSchema>;

// --- Subjective fit rubric ---
export const RubricSchema = z.object({
  summary: z.string(),
  criteria: z.array(z.string()).min(1),
});
export type Rubric = z.infer<typeof RubricSchema>;

// --- Combined output of the extraction step ---
export const ExtractionSchema = z.object({
  filters: FiltersSchema,
  rubric: RubricSchema,
});
export type Extraction = z.infer<typeof ExtractionSchema>;

// --- Score for a single profile ---
export const ProfileScoreSchema = z.object({
  id: z.string(),
  score: z.number().min(0).max(100),
  justification: z.string(),
});
export type ProfileScore = z.infer<typeof ProfileScoreSchema>;

export const ScoringResultSchema = z.object({
  scores: z.array(ProfileScoreSchema),
});
export type ScoringResult = z.infer<typeof ScoringResultSchema>;

// --- Refinement step: updates filters/rubric from recruiter feedback ---
export const RefinementSchema = z.object({
  filters: FiltersSchema,
  rubric: RubricSchema,
  explanation: z.string(),
});
export type Refinement = z.infer<typeof RefinementSchema>;

// --- Candidate profile (matches profiles.json) ---
export const PastCompanySchema = z.object({
  company: z.string(),
  company_type: z.enum(["startup", "scaleup", "enterprise", "agency"]),
  title: z.string(),
  years: z.number(),
});

export const ProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  current_title: z.string(),
  years_experience: z.number(),
  location: z.string(),
  current_company: z.string(),
  current_company_type: z.enum(["startup", "scaleup", "enterprise", "agency"]),
  skills: z.array(z.string()),
  past_companies: z.array(PastCompanySchema),
  education: z.string(),
  summary: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;
