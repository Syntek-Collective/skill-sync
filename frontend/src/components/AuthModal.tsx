import { useState } from "react";
import { supabase } from "../supabaseClient";

type AuthMode = "login" | "signup";

type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (name: string) => void;
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
};

function AuthModal({
  isOpen,
  onClose,
  onAuthSuccess,
  authMode,
  setAuthMode,
}: AuthModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  return <div></div>;
}

export default AuthModal;
