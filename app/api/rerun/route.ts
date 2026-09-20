import { NextRequest, NextResponse } from "next/server";
import { FiltersSchema, RubricSchema } from "@/lib/schemas";
import { runSearch } from "@/lib/pipeline";
import { handleApiError } from "@/lib/api-error";
import { z } from "zod";

const BodySchema = z.object({ filters: FiltersSchema, rubric: RubricSchema });

export async function POST(req: NextRequest) {
  try {
    const { filters, rubric } = BodySchema.parse(await req.json());
    const result = await runSearch(filters, rubric);
    return NextResponse.json({ filters, rubric, ...result });
  } catch (err) {
    return handleApiError(err);
  }
}
