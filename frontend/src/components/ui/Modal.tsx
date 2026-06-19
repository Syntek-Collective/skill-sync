import React from 'react';
import {Button} from './Button'

// Design Constants
const COLORS = {
    overlay: 'rgba(0, 0, 0, 0.5)',
    modalBackground: '#ffffff',
    primaryText: '#1e293b',
    accent: '#4f46e5'
};

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
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: COLORS.overlay,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        }}>
            <div style={{
                backgroundColor: COLORS.modalBackground,
                padding: '2rem',
                borderRadius: '8px',
                maxWidth: '500px',
                width: '90%',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
            }}>

                {/* Header Section */}
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '1rem'}}>
                    <h2 style={{color: COLORS.primaryText, margin: 0}}>{title}</h2>
                    <Button onClick={onClose} label="x" />
                </div>

                {/* Content Section */}
                <div style={{marginBottom: '2rem'}}>
                    {children}
                </div>

                {/* Action Footer */}
                <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px'}}>
                    <Button onClick={onClose} label="Cancel" />
                    <Button onClick={() => console.log('Action performed')} label="Confirm" />
                </div>
            </div>
        </div>
    );
};

