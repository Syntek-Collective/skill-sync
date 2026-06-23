import React, { useState } from 'react';

import Modal from './ui/Modal';
import Button from './ui/Button';
import { supabase } from '../supabaseClient';

interface JobPostingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (jobData: any) => void;
    }

    const JobPostingModal: React.FC<JobPostingModalProps> = ({
    isOpen,
    onClose,
    onSave,
    }) => {
    const [jobTitle, setJobTitle] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const handleSave = async () => {
        if (!jobTitle) {
        setError('Job title is required.');
        return;
        }

        setIsLoading(true);
        setError(null);

        try {
        const { error: dbError } = await supabase
            .from('job_postings')
            .insert([{ title: jobTitle }]);

        if (dbError) throw dbError;

        onSave({ title: jobTitle });
        onClose();
        } catch (err) {
        console.error('Error saving job:', err);
        setError('Failed to save job posting. Please try again.');
        } finally {
        setIsLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add New Job Posting">
        <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
            Job Title
            </label>
            <input
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="e.g. Senior Software Engineer"
            />
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button 
            onClick={handleSave} 
            disabled={isLoading || !jobTitle}
            >
            {isLoading ? 'Saving...' : 'Save Job'}
            </Button>
        </div>
        </Modal>
    );
};

export default JobPostingModal;