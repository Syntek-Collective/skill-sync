import React, { useState } from "react";

import Modal from "./ui/Modal";
import Button from "./ui/Button";

// the shape of what this modal needs from App.tsx
interface JobPostingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAnalyze: (jobPosting: string) => void;
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

  const handleAnalyze = () => {
    if (!jobTitle) {
      setError("Job title is required.");
      return;
    }

    // Clear error before proceeding
    setError(null)

    // both filled - hand BOTH up to App.tsx (as one object holding both)
    // App.tsx uses the title for the history label + the posting for the analysis
    onAnalyze({ title: jobTitle, posting: jobPosting });

    // close the modal (App.tsx takes over - runs the analysis + shows loading)
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Job Posting">

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
          value={jobPosting}                              // show the current posting
          onChange={(e) => setJobPosting(e.target.value)} // update state as the user types
          className="w-full p-2 border rounded h-40"      // h-40 gives room to paste a description
          placeholder="Paste the full job description here..."
        />
      </div>

      {/* ===== ERROR MESSAGE (only shows if there IS an error) ===== */}
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {/* ===== BUTTONS ===== */}
      <div className="flex justify-end gap-2">
        {/* cancel - just close, no analysis */}
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleAnalyze} disabled={!jobTitle}>
          Analyze
        </Button>
      </div>
    </Modal>
  );
};

export default JobPostingModal;