// Turning the current job's results into files the recruiter can keep.
// Private jobs aren't stored anywhere, so downloading is how results survive leaving the page.
//
// - CSV: one row per candidate, for spreadsheets and hiring tools (built here, no library)
// - PDF: the browser's own "Save as PDF" in the print dialog, using the print-only
//        PrintReport component (see components/PrintReport.tsx)

import type { Candidate, CandidateResult, MatchStatus } from "./types";

// an analyzed candidate, ready to export
export type RankedCandidate = { fileName: string; result: CandidateResult };

// finished candidates, best score first - the same order the screen shows
export function rankCandidates(candidates: Candidate[]): RankedCandidate[] {
  return candidates
    .filter((candidate) => candidate.status === "done" && candidate.result)
    .map((candidate) => ({
      fileName: candidate.fileName,
      result: candidate.result as CandidateResult,
    }))
    .sort((a, b) => b.result.score - a.result.score);
}

const STATUS_TEXT: Record<MatchStatus, string> = {
  met: "Met",
  partial: "Partial",
  not_met: "Not shown",
};

// CSV cells are wrapped in quotes, with any quotes inside doubled, so commas, quotes and
// line breaks in summaries or evidence don't break the columns
// Spreadsheets run a cell as a FORMULA if it starts with = + - @ (or a tab / carriage return).
// File names and AI text could start that way, so text cells get a leading apostrophe, which makes
// Excel / Sheets show it as plain text. Numbers (like the score) are left alone.
function csvCell(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

// Builds the CSV text. Columns: rank, file, score, band, summary, then one column per
// requirement ("Met: <evidence>"), then strengths, concerns and interview questions.
export function buildCsv(ranked: RankedCandidate[]): string {
  // every candidate in a job shares the same requirement list, so take it from the first
  const requirements = ranked[0]?.result.requirements ?? [];

  const header = [
    "Rank",
    "Resume",
    "Score",
    "Match",
    "Summary",
    ...requirements.map((r) => `${r.requirement} (${r.importance})`),
    "Strengths",
    "Concerns",
    "Interview questions",
  ];

  const rows = ranked.map(({ fileName, result }, index) => {
    const matchById = new Map(result.matches.map((m) => [m.requirementId, m]));
    return [
      index + 1,
      fileName,
      result.score,
      result.band,
      result.summary,
      ...requirements.map((r) => {
        const match = matchById.get(r.id);
        const status = STATUS_TEXT[match?.status ?? "not_met"];
        return match?.evidence ? `${status}: ${match.evidence}` : status;
      }),
      result.strengths.join("; "),
      result.concerns.join("; "),
      result.interviewQuestions.join("; "),
    ];
  });

  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

// Makes a safe file name from the job title, e.g. "Full Stack Engineer" -> "skill-match-full-stack-engineer"
function fileSlug(jobTitle: string): string {
  const slug = jobTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `skill-match-${slug || "results"}`;
}

// Saves the CSV through the browser's normal download. The leading "\uFEFF" (byte order mark)
// tells Excel the file is UTF-8, so curly quotes and accents show correctly.
export function downloadCsv(jobTitle: string, ranked: RankedCandidate[]): void {
  const blob = new Blob(["\uFEFF" + buildCsv(ranked)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileSlug(jobTitle)}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}

// Opens the print dialog, where the recruiter picks "Save as PDF". The page's print styles hide
// the app and show only PrintReport. The document title becomes the suggested PDF file name.
export function printResults(jobTitle: string): void {
  const previousTitle = document.title;
  document.title = fileSlug(jobTitle);
  window.print();
  document.title = previousTitle;
}
