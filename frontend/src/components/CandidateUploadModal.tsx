/*
  CANDIDATE UPLOAD MODAL

  Lets a recruiter pick several resume PDFs for the current job (up to 10 per job in total).
  Each file is uploaded to the private "resumes" storage bucket under the recruiter's user id,
  and gets a row in the resumes table. The parent receives the new candidates to analyze.
*/

import React, { useState } from "react";

import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { supabase } from "../supabaseClient";
import type { Candidate } from "../types";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

interface CandidateUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  // how many more resumes this job can take (10 minus the ones already added)
  remainingSlots: number;
  onUploaded: (candidates: Candidate[]) => void;
}

// returns a reason a file can't be used, or null if it's fine
function fileProblem(file: File): string | null {
  if (file.type !== "application/pdf") return `${file.name} isn't a PDF.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name} is over 5 MB.`;
  return null;
}

const CandidateUploadModal: React.FC<CandidateUploadModalProps> = ({
  isOpen,
  onClose,
  remainingSlots,
  onUploaded,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleSelect = (fileList: FileList | null) => {
    setError(null);
    const files = Array.from(fileList ?? []);

    const problems = files.map(fileProblem).filter((problem) => problem !== null);
    if (problems.length > 0) {
      setError(problems.join(" "));
      setSelectedFiles([]);
      return;
    }

    if (files.length > remainingSlots) {
      setError(
        `You can add ${remainingSlots} more resume${remainingSlots === 1 ? "" : "s"} to this job (10 max).`,
      );
      setSelectedFiles([]);
      return;
    }

    setSelectedFiles(files);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setIsLoading(true);
    setError(null);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setError("You must be logged in to upload resumes.");
      setIsLoading(false);
      return;
    }
    const userId = userData.user.id;

    const uploaded: Candidate[] = [];
    const failed: string[] = [];

    // one at a time keeps it simple and avoids hammering storage with 10 parallel uploads
    for (const [index, file] of selectedFiles.entries()) {
      try {
        // the stored name never includes the original file name (it may contain a candidate's name)
        const filePath = `${userId}/${Date.now()}-${index}.pdf`;

        const { error: uploadError } = await supabase.storage
          .from("resumes")
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        const { data, error: insertError } = await supabase
          .from("resumes")
          .insert({
            user_id: userId,
            title: file.name,
            file_name: file.name,
            file_path: filePath,
            extracted_text: "",
          })
          .select("id")
          .single();
        if (insertError) throw insertError;

        uploaded.push({
          resumeId: data.id,
          fileName: file.name,
          filePath,
          status: "pending",
        });
      } catch (uploadFailure) {
        console.error("Error uploading resume:", uploadFailure);
        failed.push(file.name);
      }
    }

    setIsLoading(false);

    if (uploaded.length > 0) onUploaded(uploaded);

    if (failed.length > 0) {
      setError(`Couldn't upload: ${failed.join(", ")}. Please try those again.`);
      setSelectedFiles((files) => files.filter((file) => failed.includes(file.name)));
      return;
    }

    setSelectedFiles([]);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add candidate resumes">
      <div className="mb-6">
        <label
          htmlFor="candidate-upload"
          className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#9caf9a] bg-[#f7faf6] px-6 py-5 text-center transition hover:border-[#003d06] hover:bg-[#eef8ec]"
        >
          <span className="text-sm font-semibold text-[#003d06]">
            Choose resume files
          </span>
          <span className="mt-2 text-xs text-[#5f6b61]">
            PDF only, max 5 MB each, up to {remainingSlots} more for this job
          </span>
          <span className="mt-3 text-xs text-[#235c2a]">
            {selectedFiles.length > 0
              ? `${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} selected`
              : "No files selected yet"}
          </span>
        </label>

        <input
          id="candidate-upload"
          type="file"
          accept=".pdf"
          multiple
          onChange={(e) => handleSelect(e.target.files)}
          className="hidden"
        />

        {selectedFiles.length > 0 && (
          <ul className="mt-3 space-y-1 text-left text-xs text-[#4f5f52]">
            {selectedFiles.map((file) => (
              <li key={`${file.name}-${file.size}`}>{file.name}</li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        {/* Disable button during upload to prevent duplicate submissions */}
        <Button onClick={handleUpload} disabled={isLoading || selectedFiles.length === 0}>
          {isLoading ? "Uploading..." : "Add resumes"}
        </Button>
      </div>
    </Modal>
  );
};

export default CandidateUploadModal;
