import React, { useState } from "react";

import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { supabase } from "../supabaseClient";
import type { Job } from "../types";

// "Save this job" is switched OFF unless VITE_ENABLE_SAVED_JOBS=true at build time.
// Saved jobs still have known gaps (see DECISIONS.md - a saved job with no results doesn't show in
// Past jobs, so it couldn't be deleted). Until the database fix lands, every job is private.
const SAVED_JOBS_ENABLED = import.meta.env.VITE_ENABLE_SAVED_JOBS === "true";

// the shape of what this modal needs from App.tsx
interface JobPostingModalProps {
  isOpen: boolean; // is the modal open?
  onClose: () => void; // how to close it
  // hands the new job up to App.tsx (saved or not - see "Save this job" below)
  onSave: (job: Job) => void;
}

const JobPostingModal: React.FC<JobPostingModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  // track what the user types into the TITLE input
  const [jobTitle, setJobTitle] = useState("");
  // track what the user types into the POSTING textarea
  const [jobPosting, setJobPosting] = useState("");
  // "Save this job" checkbox - OFF by default, so nothing is stored unless the recruiter opts in
  const [saveJob, setSaveJob] = useState(false);
  // track an error message to show if something's missing
  const [error, setError] = useState<string | null>(null);

  // runs when the user clicks "Continue"
  const handleSubmit = async () => {
    if (!jobTitle.trim() || !jobPosting.trim()) {
      setError("Both a job title and a job posting are required.");
      return;
    }

    // PRIVATE (default): keep the job in the page only. Nothing is written to the database;
    // the posting text is sent along with the analysis requests instead.
    if (!saveJob) {
      onSave({ title: jobTitle, text: jobPosting, saved: false, id: null });
      onClose();
      return;
    }

    // SAVED: store the job posting row so the job (and its results) show up in Past jobs
    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      if (userError || !userData.user) {
        throw new Error("You must be logged in to save a job posting");
      }

      // Save the job posting row.
      // .select().single() returns the new row so we can grab its id.
      const jobInsertResponse = await supabase
        .from("job_postings")
        .insert({
          user_id: userData.user.id,
          job_title: jobTitle,
          extracted_text: jobPosting, // saves the full job description
        })
        .select()
        .single();

      if (jobInsertResponse.error) throw jobInsertResponse.error;

      // hand the job, with its new row id, up to App.tsx
      onSave({
        title: jobTitle,
        text: jobPosting,
        saved: true,
        id: String(jobInsertResponse.data.id),
      });
      onClose();
    } catch (err) {
      console.error("Error saving job posting:", err);
      setError("Failed to save job posting. Please check the console.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Job you're hiring for">
      {/* ===== TITLE INPUT (short - one line) ===== */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Job Title
        </label>
        <input
          type="text"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          className="w-full p-2 border rounded"
          placeholder="e.g. Senior Software Engineer"
        />
      </div>

      {/* ===== POSTING TEXTAREA (long - multi-line for a full description) ===== */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Job Posting
        </label>
        <textarea
          value={jobPosting}
          onChange={(e) => setJobPosting(e.target.value)}
          className="w-full p-2 border rounded h-40"
          placeholder="Paste the full job description here..."
        />
      </div>

      {/* ===== PRIVACY NOTE + SAVE OPTION =====
          Nothing is stored by default. The wording has to stay accurate: if the box is ticked,
          resumes and results ARE stored (until the recruiter deletes the job). */}
      <div className="mb-6 rounded-md bg-[#f7faf6] p-3 text-left text-xs text-[#4f5f52]">
        <p>
          <span className="font-semibold text-[#003d06]">Your privacy:</span> By default,
          SkillSync doesn't store resumes, job postings, or results. Resumes are read only to
          run the analysis, then discarded. Download your results before leaving the page.
          Analyses are sent to OpenAI using your own API key.
        </p>
        {/* only shown when saved jobs are switched on (see SAVED_JOBS_ENABLED above) */}
        {SAVED_JOBS_ENABLED && (
          <label className="mt-3 flex items-start gap-2 text-[#003d06]">
            <input
              type="checkbox"
              checked={saveJob}
              onChange={(e) => setSaveJob(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-semibold">Save this job</span> so I can come back to it
              later. Saved resumes and results are stored in my account until I delete the job.
            </span>
          </label>
        )}
      </div>

      {/* ===== ERROR MESSAGE (only shows if there IS an error) ===== */}
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {/* ===== BUTTONS ===== */}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!jobTitle || !jobPosting}
        >
          Continue
        </Button>
      </div>
    </Modal>
  );
};

export default JobPostingModal;
