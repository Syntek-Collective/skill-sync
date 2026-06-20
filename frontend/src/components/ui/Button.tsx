type ButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
};

const Button = ({ children, onClick }: ButtonProps) => {
  return (
    <button
      onClick={onClick}
      className="rounded-full border border-[#c8d0c6] bg-white/85 px-10 py-3 text-sm font-medium text-[#003d06] shadow-[0_8px_18px_rgba(0,61,6,0.28)] transition-all hover:-translate-y-0.5 hover:bg-[#eef8ec] hover:shadow-[0_12px_24px_rgba(0,61,6,0.35)]"
    >
      {children}
    </button>
  );
};

export default Button;
