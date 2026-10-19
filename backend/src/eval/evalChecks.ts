//Pass/fail checks for one golden-dataset case.
//Kept separate from evalRunner so they can be unit tested without calling OpenAI.

import { MatchBand, Requirement, RequirementMatch } from "../types";
import { GoldenDatasetCase } from "./goldenDataset";

//case-insensitive keyword match against requirement text.
//short keywords ("C", "SQL", "AWS") must be a whole word, so "C" doesn't hit "C++"
//and "SQL" doesn't hit "NoSQL"; longer ones can appear anywhere ("Pilates certification")
export function requirementMentions(requirement: string, keyword: string): boolean {
  const text = requirement.toLowerCase();
  const word = keyword.toLowerCase();

  if (word.length <= 3) {
    return text.split(/[\s,/()\-.:;]+/).includes(word);
  }
  return text.includes(word);
}

type CaseOutcome = {
  requirements: Requirement[];
  matches: RequirementMatch[];
  score: number;
  band: MatchBand;
};

//returns a list of failure messages; an empty list means the case passed
export function checkCase(testCase: GoldenDatasetCase, outcome: CaseOutcome): string[] {
  const failures: string[] = [];
  const statusById = new Map(outcome.matches.map((match) => [match.requirementId, match.status]));

  const [low, high] = testCase.expectedScoreRange;
  if (outcome.score < low || outcome.score > high) {
    failures.push(`Score: expected ${low}-${high}, got ${outcome.score}`);
  }

  if (outcome.band !== testCase.expectedBand) {
    failures.push(`Band: expected "${testCase.expectedBand}", got "${outcome.band}"`);
  }

  const requirementsFor = (keyword: string) =>
    outcome.requirements.filter((requirement) =>
      requirementMentions(requirement.requirement, keyword),
    );

  for (const keyword of testCase.shouldMeet) {
    const found = requirementsFor(keyword);
    if (found.length === 0) {
      failures.push(`Should meet "${keyword}": no requirement mentions it`);
    } else if (!found.some((requirement) => statusById.get(requirement.id) !== "not_met")) {
      failures.push(`Should meet "${keyword}": marked not met`);
    }
  }

  for (const keyword of testCase.shouldNotMeet) {
    const found = requirementsFor(keyword);
    if (found.length === 0) {
      failures.push(`Should not meet "${keyword}": no requirement mentions it`);
    } else if (found.some((requirement) => statusById.get(requirement.id) !== "not_met")) {
      failures.push(`Should not meet "${keyword}": marked met or partial`);
    }
  }

  for (const [keyword, importance] of Object.entries(testCase.expectedImportance)) {
    const found = requirementsFor(keyword);
    if (found.length === 0) {
      failures.push(`Importance of "${keyword}": no requirement mentions it`);
    } else if (!found.every((requirement) => requirement.importance === importance)) {
      failures.push(`Importance of "${keyword}": expected ${importance}`);
    }
  }

  return failures;
}
