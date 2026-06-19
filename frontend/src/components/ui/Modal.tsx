import React from 'react';


interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({isOpen, onClose, title, children}) => {
    // Logic to prevent modal from rendering if isOpen is false
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">

            {/* The Modal Card */}
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl relative p-8">

                {/* Close Button - Absolute positioning to the top right */}
                <button 
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl font-light"
                    aria-label="Close"
                >
                    &times;
                </button>

                {/* Header Section */}
                <h2 className="text-xl font-bold mb-6 text-gray-800">{title}</h2>

                {/* Content Section */}
                <div className="mb-6">
                    {children}
                </div>
            </div>
        </div>
    );
};

