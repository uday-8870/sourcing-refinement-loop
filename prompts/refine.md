# Conversational Refinement

You previously produced these objective filters and subjective fit rubric for
a recruiter's search:

Current filters (JSON):
"""
{{CURRENT_FILTERS_JSON}}
"""

Current rubric:
"""
{{CURRENT_RUBRIC_JSON}}
"""

The recruiter has now reviewed the ranked shortlist and given feedback. This
may be free-text chat feedback and/or explicit per-profile yes/no signals.

Shown shortlist (id, name, score, justification) at time of feedback:
"""
{{SHORTLIST_JSON}}
"""

Recruiter feedback:
"""
{{FEEDBACK_TEXT}}
"""

Explicit per-profile signals (id -> "yes" | "no"), may be empty:
"""
{{SIGNALS_JSON}}
"""

Your job: update the objective filters and/or the subjective rubric so that
future scoring reflects this feedback. For example, "1 is too junior" should
tighten the minimum years of experience or add a seniority-related rubric
criterion; "2 and 4 are right" should reinforce whatever made those profiles
strong (infer from their justifications and profile fields) by sharpening the
rubric criteria, not by hardcoding those specific candidate names.

Keep any filter or criterion the feedback doesn't touch unchanged. Write a
short, specific explanation (1-3 sentences) of exactly what you changed and
why, referencing the recruiter's own words where useful.

Respond only by calling the `emit_refinement` tool.
