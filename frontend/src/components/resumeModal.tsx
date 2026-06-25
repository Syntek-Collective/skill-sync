import React, { useState } from "react";

import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { supabase } from "../supabaseClient";

interface ResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
  // now passes BOTH the filePath AND the new resume's id up to App.tsx
  onSave: (filePath: string, resumeId: string) => void;
}

const ResumeModal: React.FC<ResumeModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Logic to handle the file upload to Supabase Storage
  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsLoading(true);
    setError(null);

    try {
      // Ask Supabase who the currently logged-in user is.
      // We need this id for both the Storage path and the resumes table row.
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      // Stop the upload if Supabase does not find an active logged-in user.
      if (userError || !userData.user) {
        throw new Error("You must be logged in to upload a resume");
      }

      // Save the authenticated user's id so this resume belongs to the correct user.
      const userId = userData.user.id;

      // Create a unique file name using timestamp to prevent overwrites
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;

      //Store resumes inside a user-specific folder in the "resumes" bucket.
      const filePath = `${userId}/${fileName}`;

      // Upload the file to the 'resumes' bucket in Supabase
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      //Save a database row that points to the uploaded resume file.
      //The actual file lives in Storage; this row lets the app find it later.
      //.select().single() returns the new row so we can grab its id.
      const resumeInsertResponse = await supabase
        .from("resumes")
        .insert({
          user_id: userId,
          title: selectedFile.name,
          file_name: selectedFile.name,
          file_path: filePath,
          extracted_text: "",
        })
        .select()
        .single();

      if (resumeInsertResponse.error) throw resumeInsertResponse.error;

      // grab the new resume row's id so the analyze flow can reference it later
      const resumeId = resumeInsertResponse.data.id;

      // Success: pass the path AND the resume id up, then close
      onSave(filePath, resumeId);
      onClose();
    } catch (error) {
      console.error("Error uploading file:", error);
      setError("Failed to upload resume. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Upload your resume">
      {/* File upload block */}
      <div className="mb-6">
        <label
          htmlFor="resume-upload"
          className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#9caf9a] bg-[#f7faf6] px-6 py-5 text-center transition hover:border-[#003d06] hover:bg-[#eef8ec]"
        >
          <span className="text-sm font-semibold text-[#003d06]">
            Choose resume file
          </span>
          <span className="mt-2 text-xs text-[#5f6b61]">
            PDF or DOCX, max 5 MB
          </span>
          <span className="mt-3 text-xs text-[#235c2a]">
            {selectedFile ? selectedFile.name : "No file selected yet"}
          </span>
        </label>

        <input
          id="resume-upload"
          type="file"
          accept=".pdf, .docx"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              setSelectedFile(e.target.files[0]);
            }
          }}
          className="hidden"
        />
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {/* Action Footer */}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        {/* Disable button during upload to prevent duplicate submissions */}
        <Button onClick={handleUpload} disabled={isLoading || !selectedFile}>
          {isLoading ? "Uploading..." : "Save Resume"}
        </Button>
      </div>
    </Modal>
  );
};

export default ResumeModal;