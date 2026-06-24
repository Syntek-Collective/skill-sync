import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseKey);

export type SaveJobPostingInput = {
  userId: string;
  jobTitle?: string;
  companyName?: string;
  fileName?: string;
  filePath?: string;
  extractedText: string;
};

export type SaveAnalysisInput = {
  userId: string;
  resumeId: string;
  jobPostingId: string;
  prompt: string;
  matchedSkills: unknown;
  skillGap: unknown;
  summary: string;
};

//Fetches a resume PDF from the resumes Storage bucket.
export async function fetchResumeFile(filePath: string): Promise<Buffer> {
    const { data, error } = await supabase.storage
    .from("resumes")
    .download(filePath);

    if (error) {
        throw new Error(`Could not download resume: ${error.message}`);
    }

    const arrayBuffer = await data.arrayBuffer();

    return Buffer.from(arrayBuffer);
}

//Saves the job posting text so it can be linked to an analysis
export async function saveJobPosting(input: SaveJobPostingInput) {

    const { data, error } = await supabase 
        .from("job_postings")
            .insert({
                user_id: input.userId,
                job_title: input.jobTitle ?? null,
                company_name: input.companyName ?? null,
                file_name: input.fileName ?? null,
                file_path: input.filePath ?? null,
                extracted_text: input.extractedText,
            })
            .select()
            .single();

            if (error) {
                throw new Error(`Could not save job posting: ${error.message}`);
            }

            return data;
}

//Saves the final OpenAI analysis result.
export async function saveAnalysis(input: SaveAnalysisInput) {
    const { data, error } = await supabase
        .from("analyses")
        .insert({
            user_id: input.userId,
            resume_id: input.resumeId,
            job_posting_id: input.jobPostingId,
            prompt: input.prompt,
            matched_skills: input.matchedSkills,
            skill_gap: input.skillGap,
            summary: input.summary,
        })
        .select()
        .single();

        if (error) {
                throw new Error(`Could not save analysis: ${error.message}`);
        }

        return data;
}

