import React, { useState } from "react";

import Modal from "./ui/Modal";
import Button from "./ui/Button";

interface JobPostingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAnalyze: (jobTitle: string) => void;
}

const JobPostingModal: React.FC<JobPostingModalProps> = ({
  isOpen,
  onClose,
  onAnalyze,
}) => {
  const [jobTitle, setJobTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = () => {
    // Added .trim() to ensure users can't just type spaces
    const trimmedTitle = jobTitle.trim();

    // if (!jobTitle) {
    //   setError("Job title is required.");
    //   return;
    // }

    if (!trimmedTitle) {
      setError("Job title is required.");
    }

    // Clear error before proceeding
    setError(null)

    // send the job posting up to App.tsx (which runs the analysis + shows the loading)
    onAnalyze(jobTitle);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Job Posting">
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Job Title
        </label>
        <input
          type="text"
          value={jobTitle}
          onChange={(e) => {
            setJobTitle(e.target.value);
            // 3. Clear error when user starts typing again
            if (error) setError(null);
          }}
          className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="e.g. Senior Software Engineer"
        />
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleAnalyze} disabled={!jobTitle.trim()}>
          Analyze
        </Button>
      </div>
    </Modal>
  );
};

export default JobPostingModal;
