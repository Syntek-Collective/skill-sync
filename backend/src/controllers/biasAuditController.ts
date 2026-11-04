/*

    What feature is it for?
    The bias audit (docs/RANKING.md): each resume is scored twice or more by the EXISTING scorer,
    identical except for one demographic proxy (a name, pronouns, graduation year). The score
    difference isolates that attribute's effect.

    POST /api/bias-audit -> 200 { reports }
      { requirements, attributes, runs?: 1-3 (default 2), candidates: 1-5 }
      candidates are saved ([{ id, resumeId }]) or private ([{ id, resumePdf }]), like /api/rankings.

    PRIVACY
    - Resume text is redacted before anything else happens, and nothing is stored.
    - The response holds variant LABELS and scores only - never the variant texts (which are the
      candidate's resume with a name, pronouns or year changed).

*/

import { Request, Response } from "express";

import { runBiasAudit, type AttributeReport } from "../services/biasAudit";
import type { ProxyAttribute } from "../services/counterfactual";
import { parseRequirements } from "../services/scoring";
import { loadSavedResumeText } from "../services/rankingRunner";
import { parseCandidates, readApiKey, readPrivateTexts, sendError } from "./rankingController";

export const MIN_AUDIT_CANDIDATES = 1;
export const MAX_AUDIT_CANDIDATES = 5;
export const PROXY_ATTRIBUTES: readonly ProxyAttribute[] = ["name_gender", "name_ethnicity", "pronouns", "graduation_year"];

function parseAttributes(value: unknown): ProxyAttribute[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > PROXY_ATTRIBUTES.length) return null;
  const attributes: ProxyAttribute[] = [];
  for (const item of value) {
    if (!PROXY_ATTRIBUTES.includes(item as ProxyAttribute)) return null;
    if (attributes.includes(item as ProxyAttribute)) return null;
    attributes.push(item as ProxyAttribute);
  }
  return attributes;
}

// keep labels and numbers; drop every variant text
function stripVariantTexts(reports: AttributeReport[]) {
  return reports.map((report) => ({
    attribute: report.attribute,
    pairs: report.pairs.map((pair) => ({
      candidateId: pair.candidateId,
      baseline: { label: pair.baseline.label },
      variant: { label: pair.variant.label },
      baselineScore: pair.baselineScore,
      variantScore: pair.variantScore,
      delta: pair.delta,
    })),
    meanDelta: report.meanDelta,
    ci95: report.ci95,
    flipRate: report.flipRate,
    impactRatio: report.impactRatio,
  }));
}

// POST /api/bias-audit -> { reports }
const biasAuditController = async (req: Request, res: Response) => {
  // the user comes from the token authMiddleware verified, never from the body
  const userId: string = res.locals.user.id;
  const body = req.body ?? {};

  const requirements = parseRequirements(body.requirements);
  if (!requirements) {
    return res.status(400).json({ error: "A valid requirements list is required." });
  }

  const attributes = parseAttributes(body.attributes);
  if (!attributes) {
    return res.status(400).json({
      error: `attributes must be a list of: ${PROXY_ATTRIBUTES.join(", ")}.`,
    });
  }

  const runs = body.runs ?? 2;
  if (typeof runs !== "number" || !Number.isInteger(runs) || runs < 1 || runs > 3) {
    return res.status(400).json({ error: "runs must be 1, 2 or 3." });
  }

  const parsed = parseCandidates(body.candidates, MIN_AUDIT_CANDIDATES, MAX_AUDIT_CANDIDATES);
  if ("error" in parsed) {
    return res.status(400).json({ error: parsed.error });
  }

  const apiKey = readApiKey(req);
  if (!apiKey) {
    return res.status(400).json({ error: "Add your OpenAI API key to run an audit." });
  }

  try {
    const resumes: { id: string; text: string }[] = [];

    if (parsed.mode === "saved") {
      // only resumes this user owns (getResumeForUser inside); text comes back redacted
      for (const candidate of parsed.candidates) {
        const text = await loadSavedResumeText(candidate.resumeId, userId);
        if (text === null) {
          return res.status(404).json({ error: "Resume not found." });
        }
        resumes.push({ id: candidate.id, text });
      }
    } else {
      const texts = await readPrivateTexts(parsed.candidates);
      if (!texts) {
        return res.status(400).json({ error: "Couldn't read the text in one of the PDFs." });
      }
      for (const [id, text] of texts) resumes.push({ id, text });
    }

    const reports = await runBiasAudit(apiKey, requirements, resumes, attributes, { runs });
    return res.json({ reports: stripVariantTexts(reports) });
  } catch (error) {
    return sendError(res, "Bias audit", error);
  }
};

export default biasAuditController;
