import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractFiltersAndRubric } from "@/lib/llm";
import { runSearch } from "@/lib/pipeline";
import { handleApiError } from "@/lib/api-error";

const BodySchema = z.object({ query: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const { query } = BodySchema.parse(await req.json());
    const { filters, rubric } = await extractFiltersAndRubric(query);
    const result = await runSearch(filters, rubric);
    return NextResponse.json({ filters, rubric, ...result });
  } catch (err) {
    return handleApiError(err);
  }
}
