import React, {useState} from 'react';
import {Modal} from './ui/Modal';
import Button from './ui/Button'

interface ResumeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (text: string, file?: File) => void;
}

const ResumeModal: React.FC<ResumeModalProps> = ({isOpen, onClose, onSave}) => {
    const [resumeText, setResumeText] = useState<string>('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    // If isOpen is false, return null to hide from the UI
    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Upload your resume">
            
            {/* File upload block */}
            <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Or upload a file (PDF/DOCX)
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

            <p className="text-sm text-gray-400 mb-2">Paste text below:</p>

            <textarea 
                className="w-full h-40 border-2 border-green-200 rounded-lg p-2 mb-6 focus:border-green-500 outline-none"
                placeholder="Paste your resume text here..."
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
            />

            {/* Action Footer */}
            <div className="flex justify-end gap-2">
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={() => { onSave(resumeText, selectedFile ?? undefined); onClose(); }}>
                    Save Resume
                </Button>
            </div>
        </Modal>
    );
};

export default ResumeModal;