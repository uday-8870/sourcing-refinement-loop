import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FiltersSchema, RubricSchema } from "@/lib/schemas";
import { refineFiltersAndRubric } from "@/lib/llm";
import { runSearch } from "@/lib/pipeline";
import { handleApiError } from "@/lib/api-error";

const BodySchema = z.object({
  currentFilters: FiltersSchema,
  currentRubric: RubricSchema,
  shortlist: z.array(
    z.object({ id: z.string(), name: z.string(), score: z.number(), justification: z.string() })
  ),
  feedbackText: z.string().default(""),
  signals: z.record(z.enum(["yes", "no"])).default({}),
});

export async function POST(req: NextRequest) {
  try {
    const body = BodySchema.parse(await req.json());
    const { filters, rubric, explanation } = await refineFiltersAndRubric({
      currentFilters: body.currentFilters,
      currentRubric: body.currentRubric,
      shortlist: body.shortlist,
      feedbackText: body.feedbackText,
      signals: body.signals,
    });
    const result = await runSearch(filters, rubric);
    return NextResponse.json({ filters, rubric, explanation, ...result });
  } catch (err) {
    return handleApiError(err);
  }
}
