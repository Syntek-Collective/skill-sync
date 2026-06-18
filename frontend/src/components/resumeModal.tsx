import React, {useState} from 'react';

interface ResumeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (text: string) => void
}

const ResumeModal: React.FC<ResumeModalProps> = ({isOpen, onClose, onSave}) => {
    const [resumeText, setResumeText] = useState<string>('');

    // If isOpen is false, return null to hide from the UI
    if (!isOpen) return;

    return (
        <div className="fixed inset-0 bg-green-900 bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-xl">
                <h2 className="text-xl font-bold mb-4 text-green-800">Upload your resume</h2>

                {/* New File upload block */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Or upload a file (PDF/DOCX)
                    </label>
                    <input 
                        type="file"
                        accept=".pdf, .docx"
                        className="block w-full text-sm text-green-700 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                    />
                </div>

                <p className="text-sm text-gray-400 mb-2">Paste text below:</p>

                {/* Render a textarea. On change, update the local 'resumeText' state  */}
                <textarea 
                    className="w-full h-40 border-2 border-2 border-green-200 rounded-lg p-2 mb-4 focus:border-green-500 outline-none"
                    placeholder="Paste your resume text here..."
                    value={resumeText}
                    onChange={(e) => setResumeText(e.target.value)}
                />

                <div className="flex justify-end gap-2">
                    {/* On Cancel click, trigger onClose() to close the modal. */}
                    <button onClick={onClose} className="px-4 py-2 text-green-700 hover:bg-green-50 rounded-lg">
                        Cancel
                    </button>
                    {/* On Save click, call onSave(resumeText) the call onClose(). */}
                    <button
                        onClick={() => {onSave(resumeText); onClose();}}
                        className="px-6 py-2 bg-green-700 text-white rounded-full hover:bg-green-800 transition-color"
                    >
                        Save Resume
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ResumeModal;