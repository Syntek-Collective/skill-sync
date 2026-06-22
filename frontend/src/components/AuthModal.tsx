import { useState, type SyntheticEvent } from "react";
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

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (authMode === "signup") {
        const response = await supabase.auth.signUp({
          email: email,
          password: password,
          options: {
            data: {
              username: name,
            },
          },
        });

        const user = response.data.user;
        const signUpError = response.error;

        if (signUpError) {
          setError(signUpError.message);
          return;
        }

        if (!user) {
          setError("Could not create user.");
          return;
        }
        const profileResponse = await supabase.from("profiles").insert({
          id: user.id,
          username: name,
          email: email,
        });

        const profileError = profileResponse.error;

        if (profileError) {
          setError(profileError.message);
          return;
        }

        onAuthSuccess(name);
      } else {
        // 1. login in with Supabse
        const response = await supabase.auth.signInWithPassword({
          email: email,
          password: password,
        });
        // 2. check if login failed
        const loginError = response.error;

        if (loginError) {
          setError(loginError.message);
          return;
        }

        // 3. now that login worked get the user's profile
        const profileResponse = await supabase
          .from("profiles")
          .select("username")
          .eq("email", email)
          .single();

        const profile = profileResponse.data;
        const profileError = profileResponse.error;

        if (profileError) {
          setError(profileError.message);
          return;
        }

        if (!profile) {
          setError("Could not find profile");
          return;
        }

        if (!profile.username) {
          setError("Could not find username.");
          return;
        }

        onAuthSuccess(profile.username);
      }
    } catch (err) {
      console.error("Auth failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={authMode === "login" ? "Log in" : "Sign up"}
    >
      <form onSubmit={handleSubmit}>
        {authMode === "signup" && (
          <input
            type="text"
            placeholder="Name"
            value={name}
            required
            onChange={(e) => setName(e.target.value)}
          />
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          required
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
