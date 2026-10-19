/*
  PRINT REPORT

  The "Download PDF" layout. It's hidden on screen ("hidden print:block") and is the only thing
  that shows when the page is printed - App.tsx hides everything else with "print:hidden".
  The recruiter gets it through the print dialog's "Save as PDF" (see printResults in
  exportResults.ts), so no PDF library is needed.

  Unlike the on-screen cards, every candidate's full breakdown is shown (nothing is collapsed),
  because a PDF can't be clicked open.
*/

import type { RankedCandidate } from "../exportResults";
import type { MatchStatus } from "../types";

const STATUS_TEXT: Record<MatchStatus, string> = {
  met: "Met",
  partial: "Partial",
  not_met: "Not shown",
};

type PrintReportProps = {
  jobTitle: string;
  ranked: RankedCandidate[];
};

// a titled bullet list that's skipped when empty
function PrintList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="font-semibold">{title}</p>
      <ul className="list-disc pl-5">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function PrintReport({ jobTitle, ranked }: PrintReportProps) {
  return (
    <div className="hidden print:block p-6 text-left text-sm text-black">
      <h1 className="text-2xl font-bold">Skill Match: {jobTitle}</h1>
      <p className="mt-1 text-xs">
        Generated {new Date().toLocaleDateString()} by SkillSync. Scores reflect only what each
        resume shows for this job's requirements. Use them to guide your review; you make the
        hiring decisions.
      </p>

      {ranked.map(({ fileName, result }, index) => {
        const matchById = new Map(result.matches.map((m) => [m.requirementId, m]));
        return (
          // break-inside-avoid keeps each candidate on one page where possible
          <section key={fileName + index} className="mt-6 break-inside-avoid border-t pt-4">
            <h2 className="text-lg font-semibold">
              #{index + 1} {fileName} - {result.score}% ({result.band})
            </h2>
            <p className="mt-1">{result.summary}</p>

            <table className="mt-3 w-full border-collapse text-xs">
              <thead>
                <tr className="text-left">
                  <th className="border p-1">Requirement</th>
                  <th className="border p-1">Status</th>
                  <th className="border p-1">Evidence from the resume</th>
                </tr>
              </thead>
              <tbody>
                {result.requirements.map((requirement) => {
                  const match = matchById.get(requirement.id);
                  return (
                    <tr key={requirement.id}>
                      <td className="border p-1">
                        {requirement.requirement} ({requirement.importance})
                      </td>
                      <td className="border p-1">
                        {STATUS_TEXT[match?.status ?? "not_met"]}
                      </td>
                      <td className="border p-1">{match?.evidence || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <PrintList title="Strengths" items={result.strengths} />
            <PrintList title="Concerns to check" items={result.concerns} />
            <PrintList title="Interview questions" items={result.interviewQuestions} />
          </section>
        );
      })}
    </div>
  );
}

export default PrintReport;
