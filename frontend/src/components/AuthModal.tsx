import { useState } from "react";
import { supabase } from "../supabaseClient";
import Button from "./ui/Button";
import Modal from "./ui/Modal";
import Loading from "./ui/Loading";

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

  const buttonText = authMode === "login" ? "Log In" : "Sign Up";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={authMode === "login" ? "Log in" : "Sign up"}
    >
      <form>
        {authMode === "signup" && (
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p>{error}</p>}

        <Button type="submit" disabled={isLoading}>
          {isLoading ? <Loading /> : buttonText}
        </Button>
      </form>

      <Button
        onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}
      >
        {authMode === "login"
          ? "Need an account? Sign up"
          : "Already have an account? Log in"}
      </Button>
    </Modal>
  );
}

export default AuthModal;
