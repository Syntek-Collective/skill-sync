import React, { useState } from "react";

import Modal from "./ui/Modal";
import Button from "./ui/Button";

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
  const [jobPosting, setJobPosting] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = () => {
    if (!jobPosting) {
      setError("Job posting is required.");
      return;
    }

    // send the job posting up to App.tsx (which runs the analysis + shows the loading)
    onAnalyze(jobPosting);
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
          value={jobPosting}
          onChange={(e) => setJobPosting(e.target.value)}
          className="w-full p-2 border rounded"
          placeholder="e.g. Senior Software Engineer"
        />
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleAnalyze} disabled={!jobPosting}>
          Analyze
        </Button>
      </div>
    </Modal>
  );
};

export default JobPostingModal;
