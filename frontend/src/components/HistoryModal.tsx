type HistoryItem = {
  id: string;
  jobListing: string;
  result: string;
  createdAt: string;
};

type HistoryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  historyArray: HistoryItem[];
};

function HistoryModal({ isOpen, onClose, historyArray }: HistoryModalProps) {
  if (!isOpen) return null;
  return <div></div>;
}

export default HistoryModal;
