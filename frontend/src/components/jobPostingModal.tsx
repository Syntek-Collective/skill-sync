import React, { useState } from "react";

import Modal from "./ui/Modal";
import Button from "./ui/Button";
import {supabase} from "../supabaseClient";

// the shape of what this modal needs from App.tsx
interface JobPostingModalProps {
  isOpen: boolean; // is the modal open?
  onClose: () => void; // how to close it
  onAnalyze: (jobData: { title: string; posting: string }) => void; // send BOTH the title + posting up to App.tsx
}

const JobPostingModal: React.FC<JobPostingModalProps> = ({
  isOpen,
  onClose,
  onAnalyze,
}) => {
  // track what the user types into the TITLE input
  const [jobTitle, setJobTitle] = useState("");
  // track what the user types into the POSTING textarea
  const [jobPosting, setJobPosting] = useState("");
  // track an error message to show if something's missing
  const [error, setError] = useState<string | null>(null);

  // runs when the user clicks "Analyze"
  // named handleSubmit (NOT handleAnalyze) because this modal's job is to
  // VALIDATE + HAND OFF - the ACTUAL analyzing happens in App.tsx's handleAnalyze
const handleSubmit = async () => {
  if (!jobTitle.trim() || !jobPosting.trim()) {
    setError("Both a job title and a job posting are required.");
    return;
  }

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      throw new Error("You must be logged in to save a job posting");
    }

    // Insert only the columns that actually exist in your dashboard screenshot
    const { error: insertError } = await supabase.from("job_postings").insert({
      user_id: userData.user.id,
      job_title: jobTitle,
      extracted_text: jobPosting, // Saves the full job description
    });

    if (insertError) throw insertError;

    onAnalyze({ title: jobTitle, posting: jobPosting });
    onClose();
  } catch (err: any) {
    console.error("Error saving job posting:", err);
    setError("Failed to save job posting. Please check the console.");
  }
};

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Job Posting">
      {/* ===== TITLE INPUT (short - one line) ===== */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Job Posting
        </label>
        <input
          type="text"
          value={jobTitle} // show the current title
          onChange={(e) => setJobTitle(e.target.value)} // update state as the user types
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
          value={jobPosting} // show the current posting
          onChange={(e) => setJobPosting(e.target.value)} // update state as the user types
          className="w-full p-2 border rounded h-40" // h-40 gives room to paste a description
          placeholder="Paste the full job description here..."
        />
      </div>

      {/* ===== ERROR MESSAGE (only shows if there IS an error) ===== */}
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {/* ===== BUTTONS ===== */}
      <div className="flex justify-end gap-2">
        {/* cancel - just close, no analysis */}
        <Button onClick={onClose}>Cancel</Button>

        {/* analyze - DISABLED until BOTH fields are filled (can't click otherwise) */}
        <Button onClick={handleSubmit} disabled={!jobTitle || !jobPosting}>
          Analyze
        </Button>
      </div>
    </Modal>
  );
};

export default JobPostingModal;
