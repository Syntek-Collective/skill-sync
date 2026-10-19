/*

    What is this file for?
    The GOLDEN DATASET - our set of known-good test cases used to evaluate how well 
    the AI is performing. Each case is an example input (resume + job posting) paired 
    with the IDEAL/expected analysis we'd want the AI to produce.

    What does it do?
    It doesn't run anything itself - it's the DATA we test against. An eval script runs 
    the AI on each case and compares the AI's actual output to the expected output here, 
    so we can measure if the AI is doing a good job (and catch it if it gets worse).

    Why it matters:
    Without a golden dataset we'd just be guessing whether the AI is "good." This gives 
    us a real, repeatable way to check quality - and it's a key thing that makes this 
    project stand out (a real evaluation layer, not just vibes).

    NOTE on each field (skill match format - one resume checked against one job's requirements):
    - label: a short description of what this case tests
    - resume / jobPosting: the INPUT we send to the AI
    - expectedBand / expectedScoreRange: the score the code calculates from the AI's judgments
        (bands: Strong match 80+, Partial match 50-79, Weak match below 50)
    - shouldMeet: keywords for requirements the resume DOES show (must be "met" or "partial")
    - shouldNotMeet: keywords for requirements the resume does NOT show (must be "not_met")
    - expectedImportance: keywords whose requirement must be marked "required" or "preferred"
    - expectedBehavior: a plain-English note describing what a correct analysis should do
        for this case (documentation for us - not checked by the runner)

    Keywords are matched against the extracted requirement text, case-insensitive. Short
    keywords (3 letters or fewer, like "C" or "SQL") must match a whole word, so "C" doesn't
    match "C++" and "SQL" doesn't match "NoSQL".

*/

import { RequirementImportance, MatchBand } from "../types";

export type GoldenDatasetCase = {
    label: string;
    resume: string;
    jobPosting: string;
    expectedBand: MatchBand;
    expectedScoreRange: [number, number];
    shouldMeet: string[];
    shouldNotMeet: string[];
    expectedImportance: Record<string, RequirementImportance>;
    expectedBehavior: string;
}

const goldenDataset: GoldenDatasetCase[] = [
  //Strong Fit (T)
  {
    label: "High precision: All critical skills match",
    resume: "Senior Backend Engineer with 5 years of experience building scalable applications. Expert in Python, FastAPI, and PostgreSQL. Proven track record of designing high-performance RESTful APIs, optimizing complex database queries, and leading backend architecture migrations.",
    jobPosting: "Looking for Python backend engineer. Req: Python, SQL, API design.",
    expectedBand: "Strong match",
    expectedScoreRange: [85, 100],
    shouldMeet: ["Python", "SQL", "API"],
    shouldNotMeet: [],
    expectedImportance: { Python: "required" },
    expectedBehavior: "Should mark Python, SQL (PostgreSQL counts) and API design as met, giving a strong match with no gaps.",
  },

  //Good fit with gaps (KANAMI)
  {
    label: "Candidate matches several critical requirements but is missing one or more important skills, so the analysis should identify a good fit with clear gaps.",
    resume: "Experienced yoga teacher with over 12 years of personal practice, 200+ hour and 300 hour yoga teacher trainings, and several years teaching group and private yoga classes internationally. The resume includes experience teaching Yin, Hatha, restorative, flow, and vinyasa classes, plus strong group instruction, outdoor leadership, and multilingual communication skills. It does not mention Pilates certification or Pilates teaching experience.",
    jobPosting: "Part-time yoga and Pilates teacher role at a small Vancouver studio specializing in slower, traditional movement practices. The studio is looking for someone to teach 5-7 weekly classes across Yin, Hatha, and mat Pilates, including at least 2 dedicated mat Pilates classes. Required qualifications include a 200-hour yoga teacher training, Pilates certification, experience teaching Yin and/or Hatha, group class teaching experience, strong alignment and breathwork knowledge, and a calm, supportive teaching style.",
    expectedBand: "Partial match",
    expectedScoreRange: [50, 79],
    shouldMeet: ["Yin", "Hatha", "200", "group"],
    shouldNotMeet: ["Pilates"],
    expectedImportance: { Pilates: "required" },
    expectedBehavior: "Should mark the yoga training and Yin/Hatha/group teaching as met but every Pilates requirement as not met (and required), landing in the middle.",
  },

  //Significant gaps (T)
  {
    label: "Rejection: Lacks core critical requirements",
    resume: "Entry-Level Graphic Designer with skills Adobe Photoshop, Illustrator, and Figma. Passionate about UI/UX design and branding",
    jobPosting: "Looking for Senior DevOps Engineer. Req: AWS Infrastructure, Kubernetes, Terraform, CI/CD pipelines, and 5+ years of Linux experience.",
    expectedBand: "Weak match",
    expectedScoreRange: [0, 30],
    shouldMeet: [],
    shouldNotMeet: ["AWS", "Kubernetes", "Terraform", "CI/CD", "Linux"],
    expectedImportance: { AWS: "required", Kubernetes: "required", Terraform: "required" },
    expectedBehavior: "Should mark every DevOps requirement as not met and required, giving a very low score.",
  },

  //Junk input (KANAMI)
  {
    label: "Invalid input: resume and job posting are too vague or unrelated to analyze reliably",
    resume: "Put the lime in the coconut, I like turtles, sparkles, and purple shoes",
    jobPosting: "Looking for someone great to join our team. Must be awesome",
    expectedBand: "Weak match",
    expectedScoreRange: [0, 19],
    shouldMeet: [],
    shouldNotMeet: [],
    expectedImportance: {},
    expectedBehavior: "Should not invent requirements or evidence. The posting has no concrete requirements, so the score should be very low.",
  },

  //olivia
  //Importance - does AI know the difference between must-have and would-be-nice skills (4 missing skills)
  {
    label: "Critical versus preferred - missing skills",
    resume: "I am a JavaScript software engineer with 1 year of experience. I work with CRUD apps full stack. I have my bachelors degree. I have worked with AI and vector databases",
    jobPosting: "It is required that you can write in Python and CSS. It is preferred to have 3+ years of experience. It is essential that you are familiar with AWS. And it is a plus if you have used RAG in an LLM before",
    expectedBand: "Weak match",
    expectedScoreRange: [0, 30],
    shouldMeet: [],
    shouldNotMeet: ["Python", "CSS", "AWS"],
    expectedImportance: { Python: "required", CSS: "required", AWS: "required", RAG: "preferred" },
    expectedBehavior: "Should mark Python, CSS, and AWS as required (job says required/essential) and RAG as preferred (job says 'a plus'), correctly reading the importance wording. RAG may be partial (the resume mentions vector databases).",
  },

  //olivia
  //Misleading words
  {
    label: "Misleading keywords - confusing similar but different skills",
    resume: "I am JavaScript and C++ engineer. I work with NoSQL databases. And I am well practiced in using github",
    jobPosting: "We are looking for a Java and C engineer with experience working with SQL databases. Knowledge of git is preferred",
    expectedBand: "Weak match",
    expectedScoreRange: [0, 45],
    shouldMeet: [],
    shouldNotMeet: ["Java", "C", "SQL"],
    expectedImportance: { git: "preferred" },
    expectedBehavior: "Should NOT match similar-looking skills: JavaScript is not Java, C++ is not C, NoSQL is not SQL. Should mark Java, C, and SQL as not met, and git as preferred. Git itself may be partial, since daily GitHub use usually involves git.",
  },
];

export default goldenDataset;
