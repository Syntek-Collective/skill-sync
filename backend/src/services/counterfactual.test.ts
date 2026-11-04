/*

    Tests for counterfactual - the matched resume variants used by the bias audit.
    The most important property: variants differ ONLY in the proxy. The tests diff the
    variant texts word by word and check every changed word is part of the proxy.

*/

import { buildVariants, GRADUATION_YEAR_OFFSET, NAME_LISTS, SHARED_SURNAME } from "./counterfactual";

// word-level diff (longest common subsequence): the words only in `a`, and only in `b`
function diffWords(a: string, b: string): { removed: string[]; added: string[] } {
  const x = a.split(/(\s+)/).filter((t) => t.length > 0);
  const y = b.split(/(\s+)/).filter((t) => t.length > 0);
  const lcs = x.map(() => new Array<number>(y.length + 1).fill(0));
  lcs.push(new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      lcs[i]![j] = x[i] === y[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const removed: string[] = [];
  const added: string[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { i++; j++; }
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) removed.push(x[i++]!);
    else added.push(y[j++]!);
  }
  removed.push(...x.slice(i));
  added.push(...y.slice(j));
  const words = (list: string[]) => list.filter((t) => t.trim().length > 0);
  return { removed: words(removed), added: words(added) };
}

const allNames: string[] = Object.values(NAME_LISTS).flat();
const stripPunctuation = (word: string) => word.replace(/[^A-Za-z0-9]/g, "");

const resume = `Software Engineer with 6 years of Python and PostgreSQL.
Led a team of 4; she is known for clear code reviews and mentoring.
Her work on the billing API cut latency by 40%. The design was hers, and she documented it herself.
Managers trusted her with on-call.
Education: B.S. Computer Science, State University, 2012 - 2016
Acme Corp, Senior Engineer, 2018 - 2024
Pronouns: she/her`;

describe("buildVariants: names", () => {
  it.each(["name_gender", "name_ethnicity"] as const)("%s returns 2 labelled variants that differ only in the first name", (attribute) => {
    const variants = buildVariants(resume, attribute);
    expect(variants).toHaveLength(2);
    expect(new Set(variants.map((v) => v.label)).size).toBe(2);

    const [first, second] = variants;
    const diff = diffWords(first!.text, second!.text);
    expect(diff.removed).toHaveLength(1);
    expect(diff.added).toHaveLength(1);
    expect(allNames).toContain(diff.removed[0]);
    expect(allNames).toContain(diff.added[0]);

    // and against the original resume, the only addition is the header line
    for (const variant of variants) {
      const lines = variant.text.split("\n");
      expect(lines[0]).toMatch(new RegExp(`^Name: [A-Za-z]+ ${SHARED_SURNAME}$`));
      expect(lines.slice(1).join("\n")).toBe(resume);
    }
  });

  it("uses the documented labels, reference group first", () => {
    expect(buildVariants(resume, "name_gender").map((v) => v.label)).toEqual(["male-coded", "female-coded"]);
    expect(buildVariants(resume, "name_ethnicity").map((v) => v.label)).toEqual(["White-coded", "Black-coded"]);
  });

  it("draws names from the matching lists", () => {
    const firstName = (text: string) => /^Name: (\S+)/.exec(text)![1]!;
    const [male, female] = buildVariants(resume, "name_gender");
    expect(NAME_LISTS.whiteMale).toContain(firstName(male!.text));
    expect(NAME_LISTS.whiteFemale).toContain(firstName(female!.text));

    const [white, black] = buildVariants(resume, "name_ethnicity");
    const whiteName = firstName(white!.text);
    const blackName = firstName(black!.text);
    // gender is held constant: both female-coded or both male-coded
    const bothFemale = (NAME_LISTS.whiteFemale as readonly string[]).includes(whiteName) &&
      (NAME_LISTS.blackFemale as readonly string[]).includes(blackName);
    const bothMale = (NAME_LISTS.whiteMale as readonly string[]).includes(whiteName) &&
      (NAME_LISTS.blackMale as readonly string[]).includes(blackName);
    expect(bothFemale || bothMale).toBe(true);
  });

  it("replaces an existing Name: header instead of adding a second one", () => {
    const withHeader = `Name: Pat Doe\nData analyst, 3 years of SQL.`;
    for (const variant of buildVariants(withHeader, "name_gender")) {
      expect(variant.text).not.toContain("Pat Doe");
      expect(variant.text.match(/Name:/g)).toHaveLength(1);
      expect(variant.text.split("\n")[1]).toBe("Data analyst, 3 years of SQL.");
    }
  });

  it("is deterministic", () => {
    expect(buildVariants(resume, "name_ethnicity")).toEqual(buildVariants(resume, "name_ethnicity"));
  });

  it("replaces a first line that looks like the candidate's real name instead of prepending", () => {
    const named = `\nMary-Ann O'Neil\nData analyst, 3 years of SQL.\nPython, 2019 - 2022`;
    for (const attribute of ["name_gender", "name_ethnicity"] as const) {
      for (const variant of buildVariants(named, attribute)) {
        const lines = variant.text.split("\n");
        expect(variant.text).not.toContain("Mary-Ann");
        expect(lines).toHaveLength(named.split("\n").length);
        expect(lines[0]).toBe("");
        expect(lines[1]).toMatch(new RegExp(`^Name: [A-Za-z]+ ${SHARED_SURNAME}$`));
        expect(lines.slice(2).join("\n")).toBe("Data analyst, 3 years of SQL.\nPython, 2019 - 2022");
      }
    }
  });

  it("prepends when the first line isn't a name", () => {
    for (const first of ["Data analyst, 3 years of SQL.", "jane@example.com", "Room 101 Main Street", "summary", "Software Engineer", "Senior Data Analyst", "Professional Summary", "Curriculum Vitae"]) {
      const text = `${first}\nPython`;
      for (const variant of buildVariants(text, "name_gender")) {
        expect(variant.text.split("\n").slice(1).join("\n")).toBe(text);
      }
    }
  });
});

describe("buildVariants: pronouns", () => {
  const variants = buildVariants(resume, "pronouns");
  const byLabel = Object.fromEntries(variants.map((v) => [v.label, v.text]));

  it("returns she/her, he/him and they/them variants", () => {
    expect(variants.map((v) => v.label)).toEqual(["he/him", "she/her", "they/them"]);
  });

  it("rewrites every role correctly, keeping capitalisation", () => {
    expect(byLabel["he/him"]).toContain("he is known");
    expect(byLabel["he/him"]).toContain("His work");
    expect(byLabel["he/him"]).toContain("The design was his, and he documented it himself.");
    expect(byLabel["he/him"]).toContain("trusted him with");
    expect(byLabel["he/him"]).toContain("Pronouns: he/him");

    expect(byLabel["they/them"]).toContain("they are known");
    expect(byLabel["they/them"]).toContain("Their work");
    expect(byLabel["they/them"]).toContain("The design was theirs, and they documented it themselves.");
    expect(byLabel["they/them"]).toContain("trusted them with");
    expect(byLabel["they/them"]).toContain("Pronouns: they/them");

    // the she/her variant of a she/her resume is the original
    expect(byLabel["she/her"]).toBe(resume);
  });

  it("variants differ only in pronouns (and is/are agreement for they)", () => {
    const allowed = new Set(["he", "him", "his", "himself", "she", "her", "hers", "herself",
      "they", "them", "their", "theirs", "themselves", "is", "are", "heher", "hehim", "sheher", "theythem"]);
    for (const a of variants) {
      for (const b of variants) {
        const diff = diffWords(a.text, b.text);
        for (const word of [...diff.removed, ...diff.added]) {
          expect(allowed).toContain(stripPunctuation(word).toLowerCase());
        }
      }
    }
  });

  it("leaves plural 'they' alone and returns [] when there are no he/she pronouns", () => {
    expect(buildVariants("Led a team of 5. They shipped the app in 3 months.", "pronouns")).toEqual([]);
    expect(buildVariants("Python developer. 5 years experience.", "pronouns")).toEqual([]);

    const mixed = buildVariants("He led a team; they shipped on time.", "pronouns");
    for (const variant of mixed) expect(variant.text).toContain("; they shipped on time.");
  });

  it("doesn't treat words containing pronouns as pronouns", () => {
    const text = "He built the Shell scripts and other theme tooling.";
    const he = buildVariants(text, "pronouns").find((v) => v.label === "she/her")!;
    expect(he.text).toBe("She built the Shell scripts and other theme tooling.");
  });
});

describe("buildVariants: graduation_year", () => {
  const variants = buildVariants(resume, "graduation_year");

  it("returns the original and a +20 years older variant", () => {
    expect(variants.map((v) => v.label)).toEqual(["original", "+20 years older"]);
    expect(variants[0]!.text).toBe(resume);
    expect(GRADUATION_YEAR_OFFSET).toBe(-20);
  });

  it("shifts only education years, by the offset", () => {
    const older = variants[1]!.text;
    expect(older).toContain("State University, 1992 - 1996");
    // the job dates are untouched
    expect(older).toContain("Acme Corp, Senior Engineer, 2018 - 2024");

    const diff = diffWords(resume, older);
    expect(diff.removed).toEqual(["2012", "2016"]);
    expect(diff.added).toEqual(["1992", "1996"]);
  });

  it("ignores years outside 1950-2035 and state abbreviations like MA", () => {
    expect(buildVariants("Engineer, Boston, MA, 2015 - 2019", "graduation_year")).toEqual([]);
    expect(buildVariants("Bachelor of Arts, 1940", "graduation_year")).toEqual([]);
    const [, older] = buildVariants("MBA, 2035", "graduation_year");
    expect(older!.text).toBe("MBA, 2015");
  });

  it("leaves job lines with education-like words alone", () => {
    expect(buildVariants("Associate Software Engineer, Acme Corp, 2019 - 2022", "graduation_year")).toEqual([]);
    expect(buildVariants("Teaching Assistant, State University, 2017-2018", "graduation_year")).toEqual([]);
    expect(buildVariants("Graduate Research Assistant, City College, 2015 - 2017", "graduation_year")).toEqual([]);
    expect(buildVariants("Scrum Master, Acme, 2019 - 2021", "graduation_year")).toEqual([]);
  });

  it("shifts years on lines with an explicit degree token", () => {
    const [, older] = buildVariants("B.S. Computer Science, State University, 2018", "graduation_year");
    expect(older!.text).toBe("B.S. Computer Science, State University, 1998");
    for (const [line, expected] of [
      ["Ph.D. Physics, 2010", "Ph.D. Physics, 1990"],
      ["Master of Science, 2015", "Master of Science, 1995"],
      ["Associate of Arts, Community College, 2008", "Associate of Arts, Community College, 1988"],
      ["High school diploma, 2004", "High school diploma, 1984"],
      ["BSc Mathematics 2012", "BSc Mathematics 1992"],
    ]) {
      expect(buildVariants(line!, "graduation_year")[1]!.text).toBe(expected);
    }
  });

  it("shifts years under an Education heading, up to the next section heading", () => {
    const text = [
      "EXPERIENCE",
      "Associate Software Engineer, Acme Corp, 2019 - 2022",
      "",
      "EDUCATION",
      "State University",
      "Computer Science, 2014 - 2018",
      "",
      "Skills",
      "Python since 2015",
      "",
      "Education:",
      "Lincoln High, 2010",
      "Projects:",
      "Hackathon winner, 2016",
    ].join("\n");
    const [, older] = buildVariants(text, "graduation_year");
    const diff = diffWords(text, older!.text);
    expect(diff.removed).toEqual(["2014", "2018", "2010"]);
    expect(diff.added).toEqual(["1994", "1998", "1990"]);
  });

  it("returns [] when no degree years are found", () => {
    expect(buildVariants("Python developer since 2015.", "graduation_year")).toEqual([]);
  });
});

describe("buildVariants: not applicable", () => {
  it("returns [] for an empty resume for every attribute", () => {
    for (const attribute of ["name_gender", "name_ethnicity", "pronouns", "graduation_year"] as const) {
      expect(buildVariants("   ", attribute)).toEqual([]);
    }
  });
});
