# Score Profiles Against Fit Rubric

You are evaluating a shortlist of candidates who already passed the objective
filters (skills, experience range, location, company type). Your job now is
to judge each one against the **subjective fit rubric** below and produce a
0-100 fit score with a short justification.

Fit rubric:
"""
{{RUBRIC_SUMMARY}}

Criteria:
{{RUBRIC_CRITERIA}}
"""

Candidate profiles (JSON array):
"""
{{PROFILES_JSON}}
"""

Rules:
- Score every candidate id given to you, even if the fit is weak (low score).
- The justification MUST cite specific fields from that candidate's profile
  (e.g. exact company name, exact skill, exact years_experience, an exact
  phrase from their summary) — never a generic statement that could apply to
  anyone.
- Keep each justification to 1-2 sentences.
- Higher scores = stronger match to the rubric, not just the objective
  filters (those were already satisfied by every candidate here).

Respond only by calling the `emit_scores` tool.
