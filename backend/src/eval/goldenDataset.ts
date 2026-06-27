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

*/

type ExpectedMissingSkill = {
    skill: string;
    importance: "critical" | "nice-to-have";
}

type GoldenDatasetCase = {
    label: string;
    resume: string;
    jobPosting: string;
    expectedFitLevel: string;
    expectedScoreRange: [number, number];
    expectedMatchedSkills: string[];
    expectedMissingSkills: ExpectedMissingSkill[];
    suggestions: string;
}

const goldenDataset: GoldenDatasetCase[] = [
  //Strong Fit (T)
  {
    label: "High precision: All critical skills match",
    resume: "Senior Backend Engineer with 5 years of experience building scalable applications. Expert in Python, FastAPI, and PostgreSQL. Proven track record of designing high-performance RESTful APIs, optimizing complex database queries, and leading backend architecture migrations.",
    jobPosting: "Looking for Python backend engineer. Req: Python, SQL, API design.",
    expectedFitLevel: "Strong Fit",
    expectedScoreRange: [85, 100],
    expectedMatchedSkills: ["Python", "PostgreSQL"],
    expectedMissingSkills: [],
    suggestions: "Highlight specific experience with API latency and high-concurrency database design during your technical screen to differentiate your profile.",
  },

   //Good fit with gaps (KANAMI)
  {
    label: "Candidate matches several critical requirements but is missing one or more important skills, so the analysis should identify a good fit with clear gaps.",
    resume: "Experienced yoga teacher with over 12 years of personal practice, 200+ hour and 300 hour yoga teacher trainings, and several years teaching group and private yoga classes internationally. The resume includes experience teaching Yin, Hatha, restorative, flow, and vinyasa classes, plus strong group instruction, outdoor leadership, and multilingual communication skills. It does not mention Pilates certification or Pilates teaching experience.",
    jobPosting: "Part-time yoga and Pilates teacher role at a small Vancouver studio specializing in slower, traditional movement practices. The studio is looking for someone to teach 5-7 weekly classes across Yin, Hatha, and mat Pilates, including at least 2 dedicated mat Pilates classes. Required qualifications include a 200-hour yoga teacher training, Pilates certification, experience teaching Yin and/or Hatha, group class teaching experience, strong alignment and breathwork knowledge, and a calm, supportive teaching style.",
    expectedFitLevel: "Good Fit with Gaps",
    expectedScoreRange: [51, 80],
    expectedMatchedSkills: ["Yin yoga instruction", "Hatha yoga instruction", "group yoga teaching", "200-hour yoga teacher training", "alignment-based instruction"],
    expectedMissingSkills: [
      { skill: "Pilates certification", importance: "critical" },
      { skill: "mat Pilates teaching experience", importance: "critical" },
      { skill: "Pilates principles", importance: "nice-to-have" },
      { skill: "weekly Pilates class instruction", importance: "nice-to-have" },
    ],
    suggestions: "Suggestions should be short, specific action steps focused on closing the most important gaps. They should start with an action verb, mention the exact missing skill or qualification, and avoid vague advice.",
  },

  //Significant gaps (T)
  {
    label: "Rejection: Lacks core critical requirements",
    resume: "Entry-Level Graphic Designer with skills Adobe Photoshop, Illustrator, and Figma. Passionate about UI/UX design and branding",
    jobPosting: "Looking for Senior DevOps Engineer. Req: AWS Infrastructure, Kubernetes, Terraform, CI/CD pipelines, and 5+ years of Linux experience.",
    expectedFitLevel: "Significant Gaps",
    expectedScoreRange: [0, 30],
    expectedMatchedSkills: [],
    expectedMissingSkills: [
      { skill: "AWS", importance: "critical" },
      { skill: "Kubernetes", importance: "critical" },
      { skill: "Terraform", importance: "critical" },
      { skill: "CI/CD", importance: "critical" },
      { skill: "Linux", importance: "critical" },
    ],
    suggestions: "Role requires cloud/DevOps expertise. To pivot from design, we recommend starting with AWS foundational certifications and learning infrastructure-as-code (Terraform/Kubernetes)",
  },

  //Junk input (KANAMI)
  {
    label: "Invalid input: resume and job posting are too vague or unrelated to analyze reliably",
    resume: "Put the lime in the coconut, I like turtles, sparkles, and purple shoes",
    jobPosting: "Looking for someone great to join our team. Must be awesome",
    expectedFitLevel: "Significant Gaps",
    expectedScoreRange: [0, 19],
    expectedMatchedSkills: [],
    expectedMissingSkills: [],
    suggestions: "The analysis should not invent skills, gaps, or recommendations. It should tell the user that the resume and job posting are too unclear to compare, and suggest providing a real resume with experience/skills and a real job posting with requirements.",
  },

  //olivia
  //Importance - does AI know the difference between must-have and would-be-nice skills (4 missing skills)
  {
    label: "Critical versus preferred - missing skills",
    resume: "I am a JavaScript software engineer with 1 year of experience. I work with CRUD apps full stack. I have my bachelors degree. I have worked with AI and vector databases",
    jobPosting: "It is required that you can write in Python and CSS. It is preferred to have 3+ years of experience. It is essential that you are familiar with AWS. And it is a plus if you have used RAG in an LLM before",
    expectedFitLevel: "Significant Gaps",
    expectedScoreRange: [0, 30],
    expectedMatchedSkills: [],
    expectedMissingSkills: [
      { skill: "Python", importance: "critical" },
      { skill: "CSS", importance: "critical" },
      { skill: "AWS", importance: "critical" },
      { skill: "RAG", importance: "nice-to-have" },
    ],
    suggestions: "Python, CSS, and AWS should be marked critical (job says required/essential). RAG and years of experience should be marked nice-to-have (job says 'a plus' and 'preferred').",
  },

  //olivia
  //Misleading words
  {
    label: "Misleading keywords - confusing similar but different skills",
    resume: "I am JavaScript and C++ engineer. I work with NoSQL databases. And I am well practiced in using github",
    jobPosting: "We are looking for a Java and C engineer with experience working with SQL databases. Knowledge of git is preferred",
    expectedFitLevel: "Significant Gaps",
    expectedScoreRange: [0, 30],
    expectedMatchedSkills: [],
    expectedMissingSkills: [
      { skill: "Java", importance: "critical" },
      { skill: "C", importance: "critical" },
      { skill: "SQL", importance: "critical" },
      { skill: "git", importance: "nice-to-have" },
    ],
    suggestions: "The AI should NOT match similar-looking skills: JavaScript is not Java, C++ is not C, NoSQL is not SQL, and GitHub is not git. Java, C, and SQL should be missing and critical; git should be missing and nice-to-have (job says 'preferred').",
  },
];

export default goldenDataset;
