/*
  CANDIDATE UPLOAD MODAL

  Lets a recruiter pick several resume PDFs for the current job (up to 10 per job in total),
  either with the file picker or by dragging and dropping them onto the dashed box.
  What happens to the files depends on whether the job is saved:
  - private job (the default): nothing is uploaded. The PDFs stay in this page's memory and are
    sent along with each analysis request, then forgotten when the page is left.
  - saved job: each file is uploaded to the private "resumes" storage bucket under the
    recruiter's user id and gets a row in the resumes table, so it can be reopened later.
  Either way, the parent receives the new candidates to analyze.
*/

import React, { useEffect, useRef, useState } from "react";

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
  // true only when the recruiter ticked "Save this job"; decides whether files are uploaded
  saveToAccount: boolean;
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
  saveToAccount,
  onUploaded,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // true while files are being dragged over the dialog, to highlight the drop box
  const [isDragging, setIsDragging] = useState(false);
  // dragenter/dragleave also fire when moving between child elements, so count them;
  // the highlight only turns off when the drag has really left the dialog (count back to 0)
  const dragDepth = useRef(0);

  // While the dialog is open, stop the browser's default "open the dropped file" behavior
  // everywhere on the page. Without this, a PDF dropped just outside the box would open in
  // the tab and the recruiter would lose the job they were working on.
  useEffect(() => {
    if (!isOpen) return;
    const preventFileOpen = (event: DragEvent) => event.preventDefault();
    window.addEventListener("dragover", preventFileOpen);
    window.addEventListener("drop", preventFileOpen);
    return () => {
      window.removeEventListener("dragover", preventFileOpen);
      window.removeEventListener("drop", preventFileOpen);
    };
  }, [isOpen]);

  // Checks and stores the chosen files - used by both the file picker and drag and drop.
  // A new selection replaces the previous one (same as picking files again).
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

    // PRIVATE JOB: keep the files in memory only - no upload, no database row.
    // Each gets a random id so the page can track its status.
    if (!saveToAccount) {
      onUploaded(
        selectedFiles.map((file) => ({
          resumeId: crypto.randomUUID(),
          fileName: file.name,
          file,
          status: "pending",
        })),
      );
      setSelectedFiles([]);
      onClose();
      return;
    }

    // SAVED JOB: upload each file and create its resumes row
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

  // Closing (the X or Cancel) is blocked while a saved upload is running: the upload loop would keep
  // going after the dialog closed and could add these resumes to whatever job is open next.
  const handleClose = () => {
    if (!isLoading) onClose();
  };

  // ===== DRAG AND DROP =====
  // These handlers sit on the whole dialog body, so a drop anywhere inside it counts,
  // not only a drop exactly on the dashed box.

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragging(false);
    }
  };

  // dragover must call preventDefault, or the browser won't allow a drop here
  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    // ignore drops while an upload is already in progress
    if (!isLoading) handleSelect(event.dataTransfer.files);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add candidate resumes">
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="mb-6">
          {/* the dashed box: click to open the file picker, or drop files on it.
              It turns darker while files are dragged over the dialog. */}
          <label
            htmlFor="candidate-upload"
            className={`flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-5 text-center transition hover:border-[#003d06] hover:bg-[#eef8ec] ${
              isDragging ? "border-[#003d06] bg-[#e2f2df]" : "border-[#9caf9a] bg-[#f7faf6]"
            }`}
          >
            <span className="text-sm font-semibold text-[#003d06]">
              {isDragging ? "Drop PDFs here" : "Drag PDFs here or click to choose"}
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
          <Button onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          {/* Disable button during upload to prevent duplicate submissions */}
          <Button
            variant="primary"
            onClick={handleUpload}
            disabled={isLoading || selectedFiles.length === 0}
          >
            {isLoading ? "Uploading..." : "Add resumes"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default CandidateUploadModal;
