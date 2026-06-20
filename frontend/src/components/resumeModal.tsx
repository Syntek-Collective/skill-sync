import React, {useState} from 'react';

import Modal from './ui/Modal';
import Button from './ui/Button';
import { supabase } from '../supabaseClient';

interface ResumeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (filePath: string) => void;
    isLoading: boolean;
    setIsLoading: (loading: boolean) => void;
}

const ResumeModal: React.FC<ResumeModalProps> = ({
    isOpen, 
    onClose, 
    onSave, 
    isLoading, 
    setIsLoading,
}) => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null)

    // Logic to handle the file upload to Supabase Storage
    const handleUpload = async () => {
        if (!selectedFile) return;

        setIsLoading(true);
        setError(null)

        try {
            // Create a unique file name using timestamp to prevent overwrites
            const fileExt = selectedFile.name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `resumes/${fileName}`;

            // Upload the file to the 'resumes' bucket in Supabase
            const {error: uploadError} = await supabase.storage
                .from('resumes')
                .upload(filePath, selectedFile);

            if (uploadError) throw uploadError

            // Success: Trigger onSave with the path, then close
            onSave(filePath);
            onClose()
        } catch (error) {
            console.error('Error uploading file:', error);
            setError('Failed to upload resume. Please try again.')
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Upload your resume">
            
            {/* File upload block */}
            <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload your resume (PDF/DOCX)
                </label>
                <input 
                    type="file"
                    accept=".pdf, .docx"
                    onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                            setSelectedFile(e.target.files[0]);
                        }
                    }}
                    className="block w-full text-sm text-green-700"
                />
                <p className="text-xs text-gray-500 mt-2">
                    {selectedFile ? `Selected: ${selectedFile.name}` : "No file selected"}
                </p>
            </div>

            {error && (
        <p className="text-sm text-red-600 mb-4">{error}</p>
    )}

            {/* Action Footer */}
            <div className="flex justify-end gap-2">
                <Button onClick={onClose}>Cancel</Button>
                {/* Disable button during upload to prevent duplicate submissions */}
                <Button onClick={handleUpload} disabled={isLoading || !selectedFile}>
                    {isLoading ? 'Uploading...' : 'Save Resume'}
                </Button>
            </div>
        </Modal>
    );
};

export default ResumeModal;