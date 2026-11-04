/*
  BIAS AUDIT

  Checks whether the scorer reacts to things that shouldn't matter. Each chosen resume is
  scored twice by the same scorer, identical except for one demographic proxy (e.g. a name
  usually read as male vs female). The score difference isolates that attribute's effect
  (docs/RANKING.md, "Bias audit"). It's a diagnostic of this tool, not of any candidate.
*/

import { useState } from "react";

import Button from "./ui/Button";
import Loading from "./ui/Loading";
import {
  ApiError,
  buildRankingCandidates,
  privateUploadProblem,
  runBiasAudit,
} from "../matchApi";
import { getAccessToken } from "../supabaseClient";
import type { AttributeReport, Candidate, Job, ProxyAttribute, Requirement } from "../types";

const MAX_AUDITED = 5;
// the four-fifths rule: a selection rate below 80% of the highest one suggests adverse impact
const FOUR_FIFTHS = 0.8;

const ATTRIBUTES: { id: ProxyAttribute; label: string; explanation: string }[] = [
  {
    id: "name_gender",
    label: "Gender (via name)",
    explanation: "Adds a name usually read as male or as female; nothing else changes.",
  },
  {
    id: "name_ethnicity",
    label: "Race / ethnicity (via name)",
    explanation: "Adds a name commonly associated with a particular racial or ethnic group.",
  },
  {
    id: "pronouns",
    label: "Pronouns",
    explanation: "Swaps he/him, she/her and they/them wherever the resume uses pronouns.",
  },
  {
    id: "graduation_year",
    label: "Age (via graduation year)",
    explanation: "Moves graduation years earlier, so the same resume reads as an older candidate.",
  },
];

const ATTRIBUTE_LABEL = Object.fromEntries(ATTRIBUTES.map((a) => [a.id, a.label])) as Record<
  ProxyAttribute,
  string
>;

type BiasAuditProps = {
  job: Job;
  candidates: Candidate[];
  requirements: Requirement[] | null;
  openaiKey: string;
  // true while an "Analyze" batch is running; the audit waits for it
  isBusy?: boolean;
};

function BiasAudit({ job, candidates, requirements, openaiKey, isBusy = false }: BiasAuditProps) {
  const analyzed = candidates
    .filter((candidate) => candidate.status === "done" && candidate.result)
    .sort((a, b) => (b.result?.score ?? 0) - (a.result?.score ?? 0));

  const [attributes, setAttributes] = useState<ProxyAttribute[]>(ATTRIBUTES.map((a) => a.id));
  const [runs, setRuns] = useState<1 | 2 | 3>(2);
  // null = "the top candidates by score" until the recruiter picks
  const [picked, setPicked] = useState<string[] | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [reports, setReports] = useState<AttributeReport[] | null>(null);

  // keep only picks that are still analyzed candidates (one may have been removed)
  const selectedIds = (picked ?? analyzed.slice(0, MAX_AUDITED).map((c) => c.resumeId)).filter(
    (id) => analyzed.some((c) => c.resumeId === id),
  );
  const labels = new Map(analyzed.map((c) => [c.resumeId, c.fileName]));

  const toggleAttribute = (id: ProxyAttribute) =>
    setAttributes((current) =>
      current.includes(id) ? current.filter((a) => a !== id) : [...current, id],
    );

  const toggleCandidate = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((selected) => selected !== id)
      : [...selectedIds, id];
    setPicked(next.slice(0, MAX_AUDITED));
  };

  const canRun =
    requirements !== null &&
    attributes.length > 0 &&
    selectedIds.length > 0 &&
    Boolean(openaiKey) &&
    !isBusy &&
    !isRunning;

  const handleRun = async () => {
    if (!requirements || !canRun) return;
    const chosen = analyzed.filter((c) => selectedIds.includes(c.resumeId));
    // private jobs send the PDFs themselves; check the size limits before sending
    const sizeProblem = privateUploadProblem(job, chosen);
    if (sizeProblem) {
      setError(sizeProblem);
      return;
    }
    setIsRunning(true);
    setError("");
    setReports(null);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError("Please log in again before running the audit.");
        return;
      }
      const result = await runBiasAudit(accessToken, openaiKey, {
        requirements,
        // keep the on-screen order of attributes
        attributes: ATTRIBUTES.map((a) => a.id).filter((id) => attributes.includes(id)),
        runs,
        candidates: await buildRankingCandidates(job, chosen),
      });
      setReports(result);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "The audit didn't finish. Please try again.",
      );
    } finally {
      setIsRunning(false);
    }
  };

  // each audited resume is scored (variants x runs) times per attribute
  const roughCalls = selectedIds.length * attributes.length * 2 * runs;

  return (
    <section className="mt-6 w-full max-w-3xl rounded-lg border border-green-900/20 bg-white/80 p-6 text-left shadow-md">
      <h2 className="text-lg font-semibold uppercase tracking-wide text-green-950">Bias audit</h2>
      <p className="mt-1 text-xs text-[#5f6b61]">
        Checks whether the scorer reacts to things that shouldn't matter. Each chosen resume is
        scored again with one detail changed (a name, pronouns or graduation years), and the
        score difference shows that detail's effect.
      </p>
      <p className="mt-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-900">
        The names and other changes are synthetic audit probes: they're added to copies of the
        resumes for this test only and never describe the real candidates. If a resume's first
        line looks like the candidate's own name, the probe name replaces that line, so each copy
        carries only one name. Results are a diagnostic of this scoring tool, not a fairness
        certification.
      </p>

      <fieldset className="mt-4" disabled={isRunning}>
        <legend className="text-xs font-semibold uppercase text-green-950">What to test</legend>
        <div className="mt-1 space-y-1">
          {ATTRIBUTES.map((attribute) => (
            <label key={attribute.id} className="flex items-start gap-2 text-sm text-[#4f5f52]">
              <input
                type="checkbox"
                className="mt-1"
                checked={attributes.includes(attribute.id)}
                onChange={() => toggleAttribute(attribute.id)}
              />
              <span>
                {attribute.label}
                <span className="block text-xs opacity-70">{attribute.explanation}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4" disabled={isRunning}>
        <legend className="text-xs font-semibold uppercase text-green-950">
          Resumes to test ({selectedIds.length}/{MAX_AUDITED})
        </legend>
        <div className="mt-1 space-y-1">
          {analyzed.map((candidate) => {
            const checked = selectedIds.includes(candidate.resumeId);
            return (
              <label
                key={candidate.resumeId}
                className="flex items-center gap-2 text-sm text-[#4f5f52]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && selectedIds.length >= MAX_AUDITED}
                  onChange={() => toggleCandidate(candidate.resumeId)}
                />
                <span className="truncate">{candidate.fileName}</span>
                <span className="text-xs opacity-60">{candidate.result?.score}%</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-4" disabled={isRunning}>
        <legend className="text-xs font-semibold uppercase text-green-950">Repeats</legend>
        <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-[#4f5f52]">
          {([1, 2, 3] as const).map((count) => (
            <label key={count} className="flex items-center gap-1">
              <input
                type="radio"
                name="audit-runs"
                checked={runs === count}
                onChange={() => setRuns(count)}
              />
              {count}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-[#5f6b61]">
          Each version is scored this many times and averaged, to separate a real effect from
          the ordinary variation between AI calls. About {roughCalls} scoring calls or more.
        </p>
      </fieldset>

      <div className="mt-4 flex flex-col items-center gap-2">
        <Button onClick={handleRun} disabled={!canRun}>
          {isRunning ? "Running the audit..." : "Run bias audit"}
        </Button>
        {isRunning && (
          <p className="flex items-center gap-2 text-xs text-[#5f6b61]">
            <Loading /> This can take a few minutes.
          </p>
        )}
        {!openaiKey && (
          <p className="text-xs text-[#5f6b61]">Add your OpenAI key above to run it.</p>
        )}
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-red-700">{error}</p>}

      {reports && (
        <div className="mt-5 space-y-3 border-t border-green-900/10 pt-4">
          {reports.length === 0 && (
            <p className="text-sm text-[#4f5f52]">The audit returned no results.</p>
          )}
          {reports.map((report) => (
            <AttributeCard key={report.attribute} report={report} labels={labels} />
          ))}
        </div>
      )}
    </section>
  );
}

const signed = (value: number, digits = 1) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}`;
const percent = (value: number) => `${Math.round(value * 100)}%`;

// a short plain-language reading of one attribute's numbers
function readReport(report: AttributeReport): string {
  if (report.pairs.length === 0) {
    return "Couldn't be tested on these resumes (for example, no graduation years next to a degree).";
  }
  const [low, high] = report.ci95;
  const parts: string[] = [];
  if (low <= 0 && high >= 0) {
    parts.push("No measurable effect: the score change is within ordinary run-to-run variation.");
  } else {
    parts.push(
      `Changing this moved scores ${report.meanDelta > 0 ? "up" : "down"} by about ${Math.abs(
        report.meanDelta,
      ).toFixed(1)} points on average, and the 95% interval doesn't include 0. Worth a closer look.`,
    );
  }
  if (report.flipRate > 0) {
    parts.push(`${percent(report.flipRate)} of pairs landed in a different match band.`);
  }
  if (report.impactRatio !== null && report.impactRatio < FOUR_FIFTHS) {
    parts.push(
      "One version reached Strong match less than four-fifths as often as another, which the four-fifths rule flags as possible adverse impact.",
    );
  }
  return parts.join(" ");
}

function AttributeCard({
  report,
  labels,
}: {
  report: AttributeReport;
  labels: Map<string, string>;
}) {
  const containsZero = report.ci95[0] <= 0 && report.ci95[1] >= 0;
  const belowFourFifths = report.impactRatio !== null && report.impactRatio < FOUR_FIFTHS;
  const candidatesTested = new Set(report.pairs.map((pair) => pair.candidateId));

  // average change per variant label, e.g. which name moved scores
  const byVariant = new Map<string, { total: number; count: number }>();
  for (const pair of report.pairs) {
    const key = `${pair.baseline.label} → ${pair.variant.label}`;
    const entry = byVariant.get(key) ?? { total: 0, count: 0 };
    entry.total += pair.delta;
    entry.count += 1;
    byVariant.set(key, entry);
  }

  return (
    <div className="rounded-md border border-green-900/10 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-semibold text-green-950">{ATTRIBUTE_LABEL[report.attribute]}</p>
        <p className="shrink-0 text-xs text-[#4f5f52]">
          {report.pairs.length} {report.pairs.length === 1 ? "pair" : "pairs"} from{" "}
          {candidatesTested.size} {candidatesTested.size === 1 ? "resume" : "resumes"}
        </p>
      </div>

      {report.pairs.length > 0 && (
        <dl className="mt-3 grid grid-cols-1 gap-3 text-xs text-[#4f5f52] sm:grid-cols-3">
          <div>
            <dt className="font-semibold uppercase text-green-950">Mean score change</dt>
            <dd className="mt-0.5">
              <span className={`text-lg font-bold ${containsZero ? "text-green-950" : "text-red-700"}`}>
                {signed(report.meanDelta)} pts
              </span>
              <span className="block">
                95% CI {signed(report.ci95[0])} to {signed(report.ci95[1])}
              </span>
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase text-green-950">Band flips</dt>
            <dd className="mt-0.5">
              <span className="text-lg font-bold text-green-950">{percent(report.flipRate)}</span>
              <span className="block">of pairs changed match band</span>
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase text-green-950">Impact ratio</dt>
            <dd className="mt-0.5">
              {report.impactRatio === null ? (
                <>
                  <span className="text-lg font-bold text-green-950">n/a</span>
                  <span className="block">no version reached Strong match</span>
                </>
              ) : (
                <>
                  <span
                    className={`text-lg font-bold ${belowFourFifths ? "text-red-700" : "text-green-950"}`}
                  >
                    {report.impactRatio.toFixed(2)}
                  </span>
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 ${
                      belowFourFifths ? "bg-red-100 text-red-700" : "bg-green-100 text-green-800"
                    }`}
                  >
                    {belowFourFifths ? "below 0.80" : "meets 0.80"}
                  </span>
                  <span className="block">four-fifths threshold: 0.80</span>
                </>
              )}
            </dd>
          </div>
        </dl>
      )}

      <p className="mt-3 text-sm text-[#4f5f52]">{readReport(report)}</p>

      {byVariant.size > 0 && (
        <details className="mt-2 text-xs text-[#4f5f52]">
          <summary className="cursor-pointer font-medium text-green-700 hover:opacity-70">
            Per version
          </summary>
          <ul className="mt-1 space-y-0.5 pl-4">
            {[...byVariant.entries()].map(([key, { total, count }]) => (
              <li key={key}>
                {key}: {signed(total / count)} pts ({count})
              </li>
            ))}
          </ul>
          <p className="mt-1 opacity-70">
            Tested: {[...candidatesTested].map((id) => labels.get(id) ?? "Resume").join(", ")}
          </p>
        </details>
      )}
    </div>
  );
}

export default BiasAudit;
