//Scoring for the recruiter skill match.
//The AI only judges each requirement (met / partial / not met); the score is calculated
//here in code, so the same judgments always give the same score and candidates are comparable.

import {
  MatchBand,
  MatchStatus,
  Requirement,
  RequirementMatch,
} from "../types";

export const MAX_REQUIREMENTS = 12;

const IMPORTANCE_WEIGHT = { required: 2, preferred: 1 } as const;
const STATUS_CREDIT: Record<MatchStatus, number> = { met: 1, partial: 0.5, not_met: 0 };

//Weighted share of requirements the candidate meets, from 0 to 100.
//Required requirements count double; partial matches earn half credit.
export function computeScore(requirements: Requirement[], matches: RequirementMatch[]): number {
  const statusById = new Map(matches.map((match) => [match.requirementId, match.status]));

  let earned = 0;
  let possible = 0;

  for (const requirement of requirements) {
    const weight = IMPORTANCE_WEIGHT[requirement.importance];
    const status = statusById.get(requirement.id) ?? "not_met";
    earned += weight * STATUS_CREDIT[status];
    possible += weight;
  }

  if (possible === 0) return 0;
  return Math.round((earned / possible) * 100);
}

export function scoreBand(score: number): MatchBand {
  if (score >= 80) return "Strong match";
  if (score >= 50) return "Partial match";
  return "Weak match";
}

//Lines the AI's matches up with the requirement list: exactly one match per requirement,
//in requirement order. Unknown or duplicate ids are dropped; anything the AI skipped
//counts as not met with no evidence.
export function normalizeMatches(
  requirements: Requirement[],
  matches: RequirementMatch[],
): RequirementMatch[] {
  const firstMatchById = new Map<string, RequirementMatch>();
  for (const match of matches) {
    if (!firstMatchById.has(match.requirementId)) {
      firstMatchById.set(match.requirementId, match);
    }
  }

  return requirements.map((requirement) => {
    const match = firstMatchById.get(requirement.id);
    return match
      ? { requirementId: requirement.id, status: match.status, evidence: match.evidence }
      : { requirementId: requirement.id, status: "not_met", evidence: "" };
  });
}

//Checks a requirement list sent by the frontend (it was extracted earlier and is sent back
//with each resume). Returns null if the shape is wrong, so the controller can reply 400.
export function parseRequirements(value: unknown): Requirement[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_REQUIREMENTS) {
    return null;
  }

  const requirements: Requirement[] = [];
  const seenIds = new Set<string>();

  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const { id, requirement, importance } = item as Record<string, unknown>;

    if (typeof id !== "string" || !id || id.length > 20 || seenIds.has(id)) return null;
    if (typeof requirement !== "string" || !requirement.trim() || requirement.length > 300) return null;
    if (importance !== "required" && importance !== "preferred") return null;

    seenIds.add(id);
    requirements.push({ id, requirement: requirement.trim(), importance });
  }

  return requirements;
}
