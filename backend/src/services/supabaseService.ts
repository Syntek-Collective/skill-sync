//Loads backend/.env so process.env can read Supabase keys.
import "dotenv/config";

//Creates the Supabase client used for Storage and database calls
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

//Stop early if the backend is missing required Supabse config.
if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
}

//Shared Supabase client for this service file
const supabase = createClient(supabaseUrl, supabaseKey);

//Input shape for saving job posting row.
export type SaveJobPostingInput = {
  userId: string;
  jobTitle?: string;
  companyName?: string;
  fileName?: string;
  filePath?: string;
  extractedText: string;
};

//Input shape for saving an analysis row
//The whole analysis is stored in one "result" field (jsonb column) instead of
//separate matched_skills / skill_gap / summary columns.
export type SaveAnalysisInput = {
  userId: string;
  resumeId: string;
  jobPostingId: string;
  result: unknown;
};

//Downloads a resume PDF from Supabase Storage. 
//Returns a Node Buffer because pdfService needs a Buffer to extract PDF text.
export async function fetchResumeFile(filePath: string): Promise<Buffer> {

    //Go to the "resumes" Storage bucket and download the file at filePath.
    //Example filePath: "user-123/17000000000.pdf"
    const downloadResponse = await supabase.storage
    .from("resumes")
    .download(filePath);

    //Supabase returns an object with two important parts:
    //data = the downloaded file, if the download worked
    //error = information about what went wrong, if it failed
    const data = downloadResponse.data;
    const error = downloadResponse.error;

    //If Supabase could not download the file, stop here.
    if (error) {
        throw new Error(`Could not download resume: ${error.message}`);
    }

      // TypeScript needs this check because data might still be null.
    if (!data) {
    throw new Error("Could not download resume: no file data returned");
    }

    //At this point, data is the dowloaded PDF file.
    //Supabase gies it to us in a web-style format, so we first read it as raw bytes.
    const rawFileBytes = await data.arrayBuffer();

    //Convert the raw bytes into a Node Buffer
    //pdfService expects a Buffer, so this is the format we return.
    const fileBuffer = Buffer.from(rawFileBytes);

    return fileBuffer;
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
//The whole analysis object is stored in the "result" column (jsonb).
export async function saveAnalysis(input: SaveAnalysisInput) {
    const { data, error } = await supabase
        .from("analyses")
        .insert({
            user_id: input.userId,
            resume_id: input.resumeId,
            job_posting_id: input.jobPostingId,
            result: input.result,
        })
        .select()
        .single();

        if (error) {
                throw new Error(`Could not save analysis: ${error.message}`);
        }

        return data;
}

//Fetches all saved analyses for one user.
//This will be used by the history feature.
export async function getAnalysesForUser(userId: string) {
    //Ask Supabase for rows from the analyses table.
    const { data, error } = await supabase
        //Choose the analyses table.
        .from("analyses")

        //Get all columns for now.
        .select("*")

        //Only get analyses that belong to this user.
        .eq("user_id", userId)

        //Show newest analyses first.
        .order("created_at", { ascending: false });

    //If Supabase returns an error, stop and pass the error upward
    if (error) {
        throw new Error(`Could not fetch analyses: ${error.message}`);
    }

    //Return the rows from Supabase.
    return data;
}

//Fetches one resume row, but only if it belongs to this user.
//Returns null when the resume does not exist or belongs to someone else, so callers
//can't reach another user's file by guessing an id.
export async function getResumeForUser(resumeId: string, userId: string) {
    const { data, error } = await supabase
        .from("resumes")
        .select("id, file_path")
        .eq("id", resumeId)
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        throw new Error(`Could not fetch resume: ${error.message}`);
    }

    return data;
}

//Fetches one job posting row, but only if it belongs to this user.
//Returns null when the posting does not exist or belongs to someone else.
export async function getJobPostingForUser(jobPostingId: string, userId: string) {
    const { data, error } = await supabase
        .from("job_postings")
        .select("id, extracted_text")
        .eq("id", jobPostingId)
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        throw new Error(`Could not fetch job posting: ${error.message}`);
    }

    return data;
}
