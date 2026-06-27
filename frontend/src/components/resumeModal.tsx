import React, { useState, useEffect } from "react";

import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { supabase } from "../supabaseClient";

interface ResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
  // now passes BOTH the filePath AND the new resume's id up to App.tsx
  onSave: (filePath: string, resumeId: string) => void;
  onDelete: (resumeId: string) => void;
}

// Shape of a resume row we load from Supabase so the user can reuse
// an already-uploaded resume instead of uploading the same file again.
type ExistingResume = {
  id: string;
  file_name: string;
  file_path: string;
};

const ResumeModal: React.FC<ResumeModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [existingResumes, setExistingResumes] = useState<ExistingResume[]>([]);

  //Load saved resumes when the modal opens.
  useEffect(() => {
    if (!isOpen) return;

    const loadExistingResumes = async () => {
      //Only fetch resumes for the logged in user.
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      // Stop if there is no logged-in user, since resumes are user-specific.
      if (userError || !userData.user) {
        setExistingResumes([]);
        return;
      }

      //Fetch this user's saved resumes so they can reuse one instead of uploading again.
      const { data, error } = await supabase
        .from("resumes")
        .select("id, file_name, file_path")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false });

      //If Supabase fails to load resumes stop here
      if (error) {
        console.error("Could not load resumes:", error);
        setError("Could not load existing resumes.");
        return;
      }

      //Store the saved resumes or an empty list if none were returned.
      setExistingResumes(data || []);
    };

    //run the resume-loading function when the modal opens.
    loadExistingResumes();
    //Re-run this effect whenever the modal state changes.
  }, [isOpen]);

  // Reuse a saved resume instead of uploading again.
  const handleChooseExistingResume = (resume: ExistingResume) => {
    onSave(resume.file_path, resume.id);
    onClose();
  };

  // Deletes the selected resume from Supabase Storage, removes its database row, and updates the modal list.
  const handleDeleteResume = async (resume: ExistingResume) => {
    //Clear any old error message
    setError(null);

    //Delete PDF file from resumes Storage bucket.
    const { error: storageError } = await supabase.storage
      .from("resumes")
      .remove([resume.file_path]);

    if (storageError) {
      console.error("Could not delete resume file:", storageError);
      setError("Could not delete resume file");
      return;
    }

    //Delete database row for selected resume.
    const { data: deletedRows, error: databaseError } = await supabase
      .from("resumes")
      .delete()
      .eq("id", resume.id)
      .select();

    console.log("deleted rows:", deletedRows);

    if (databaseError) {
      console.error("Could not delete resume row:", databaseError);
      setError("Could not delete resume");
      return;
    }

    //Remove the deleted resume from the screen.
    setExistingResumes((currentREsumes) =>
      currentREsumes.filter((item) => item.id !== resume.id),
    );

    //Tell App.tsx that this resume was deleted so it can clear old selected resume state.
    onDelete(resume.id);
  };

  // Logic to handle the file upload to Supabase Storage
  const handleUpload = async () => {
    if (!selectedFile) return;

    if (selectedFile.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      return;
    }

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
      {existingResumes.length > 0 && (
        <div className="mb-6 text-left">
          <p className="mb-2 text-sm font-semibold text-[#003d06]">
            Choose an existing resume
          </p>

          <div className="space-y-2">
            {existingResumes.map((resume) => (
              <div key={resume.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleChooseExistingResume(resume)}
                  className="flex-1 rounded border border-[#c8d0c6] px-3 py-2 text-left text-sm text-[#003d06] hover:bg-[#eef8ec]"
                >
                  {resume.file_name}
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteResume(resume)}
                  className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
            PDF only, max 5 MB
          </span>
          <span className="mt-3 text-xs text-[#235c2a]">
            {selectedFile ? selectedFile.name : "No file selected yet"}
          </span>
        </label>

        <input
          id="resume-upload"
          type="file"
          accept=".pdf"
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
