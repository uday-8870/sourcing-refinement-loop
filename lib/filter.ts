import type { Filters, Profile } from "./schemas";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Applies the LLM-extracted objective filters directly against the local
 * profile list. Every field is optional/lenient by design: an empty array
 * or null bound means "no constraint on this dimension".
 */
export function applyFilters(profiles: Profile[], filters: Filters): Profile[] {
  const skillSet = filters.skills.map(norm);
  const locationSet = filters.locations.map(norm);

  return profiles.filter((p) => {
    if (skillSet.length > 0) {
      const profileSkills = p.skills.map(norm);
      const hasAny = skillSet.some((s) => profileSkills.some((ps) => ps.includes(s) || s.includes(ps)));
      if (!hasAny) return false;
    }

    if (filters.min_years_experience != null && p.years_experience < filters.min_years_experience) {
      return false;
    }
    if (filters.max_years_experience != null && p.years_experience > filters.max_years_experience) {
      return false;
    }

    if (locationSet.length > 0) {
      const loc = norm(p.location);
      const matches = locationSet.some((l) => loc.includes(l) || l.includes(loc));
      if (!matches) return false;
    }

    if (filters.company_types.length > 0) {
      const currentMatches = filters.company_types.includes(p.current_company_type);
      const pastMatches = p.past_companies.some((pc) => filters.company_types.includes(pc.company_type));
      if (!currentMatches && !pastMatches) return false;
    }

    return true;
  });
}
