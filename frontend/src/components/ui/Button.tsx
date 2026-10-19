type ButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  // "primary" = the one main next step on screen (filled); "secondary" = everything else
  variant?: "primary" | "secondary";
};

const VARIANT_CLASSES = {
  primary:
    "border-[#235c2a] bg-[#235c2a] text-white hover:bg-[#1b4a21]",
  secondary:
    "border-[#c8d0c6] bg-white/85 text-[#003d06] hover:bg-[#eef8ec]",
};

const Button = ({
  children,
  onClick,
  type = "button",
  disabled = false,
  variant = "secondary",
}: ButtonProps) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-10 py-3 text-sm font-medium shadow-[0_8px_18px_rgba(0,61,6,0.28)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(0,61,6,0.35)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </button>
  );
};

export default Button;
