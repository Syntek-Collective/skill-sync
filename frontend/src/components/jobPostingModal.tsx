import React, { useState } from "react";

import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { supabase } from "../supabaseClient";

// the shape of what this modal needs from App.tsx
interface JobPostingModalProps {
  isOpen: boolean; // is the modal open?
  onClose: () => void; // how to close it
  // send the title, posting, AND the new job posting's id up to App.tsx
  onSave: (jobData: {
    title: string;
    posting: string;
    jobPostingId: string;
  }) => void;
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
  // track an error message to show if something's missing
  const [error, setError] = useState<string | null>(null);

  // runs when the user clicks "Save job"
  // saves the job posting, grabs its id, then hands everything up to App.tsx
  const handleSubmit = async () => {
    if (!jobTitle.trim() || !jobPosting.trim()) {
      setError("Both a job title and a job posting are required.");
      return;
    }

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

      // grab the new job posting's id so the analyze flow can reference it
      const jobPostingId = jobInsertResponse.data.id;

      // hand the title, posting, and id up to App.tsx
      onSave({ title: jobTitle, posting: jobPosting, jobPostingId });
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

      {/* ===== ERROR MESSAGE (only shows if there IS an error) ===== */}
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {/* ===== BUTTONS ===== */}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={!jobTitle || !jobPosting}>
          Save job
        </Button>
      </div>
    </Modal>
  );
};

export default JobPostingModal;
