import { useState, type SyntheticEvent } from "react";
import { supabase } from "../supabaseClient";
import Button from "./ui/Button";
import Modal from "./ui/Modal";
import Loading from "./ui/Loading";

// Controls whether this modal is being used to log in or sign up.
type AuthMode = "login" | "signup";

// Props from App.tsx.
type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (name: string) => void;
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
};

// Renders the signup/login form and handles Supabase auth.
function AuthModal({
  isOpen,
  onClose,
  onAuthSuccess,
  authMode,
  setAuthMode,
}: AuthModalProps) {
  // Local state tracking form inputs, error message, and loading status.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Resets all form fields and clears any visible auth error.
  const resetForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setError("");
  };

  // Switches between login and signup modes and clears the form.
  const switchAuthMode = () => {
    setAuthMode(authMode === "login" ? "signup" : "login");
    resetForm();
  };

  // The submit button changes based on user logging in or signing up.
  const buttonText = authMode === "login" ? "Log In" : "Sign Up";

  /* HELPER FUNCTIONS */

  // Looks up the user's profile row and returns their username.
  const getProfileUsername = async (userId: string) => {
    const profileResponse = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .single();

    const profile = profileResponse.data;
    const profileError = profileResponse.error;

    // Stop early if the profile or username cannot be found.
    if (profileError) {
      setError(profileError.message);
      return;
    }

    if (!profile) {
      setError("Could not find profile.");
      return;
    }

    if (!profile.username) {
      setError("Could not find username.");
      return;
    }
    return profile.username;
  };

  // Handles the signup flow through Supabase Auth.
  const handleSignup = async () => {
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

    // Stop early if Supabase could not create the user.
    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (!user) {
      setError("Could not create user.");
      return;
    }

    // Tell App.tsx signup succeeded and send back the name to display.
    onAuthSuccess(name);
  };

  // Handles the login flow and loads the user's display name.
  const handleLogin = async () => {
    const response = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    const loginError = response.error;

    if (loginError) {
      setError(loginError.message);
      return;
    }

    const user = response.data.user;

    if (!user) {
      setError("Could not log in user.");
      return;
    }

    // Login only has email/password, so use the user id to fetch the username from profiles.
    const username = await getProfileUsername(user.id);

    if (!username) {
      return;
    }

    // Tell App.tsx login succeeded and send back the username to display.
    onAuthSuccess(username);
  };

  // handleSubmit runs when the form is submitted and chooses the correct flow.
  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // Signup creates a new Supabase Auth user and sends username as metadata.
      if (authMode === "signup") {
        await handleSignup();
      } else {
        await handleLogin();
      }
      // Catch unexpected errors like network issues or thrown Supabase errors.
    } catch (err) {
      console.error("Auth failed:", err);
      setError("Something went wrong. Please try again.");
      // Always turn loading off after the auth attempt finishes.
    } finally {
      setIsLoading(false);
    }
  }

  // Render the shared Modal wrapper with the auth form inside it.
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={authMode === "login" ? "Log in" : "Sign up"}
    >
      <form onSubmit={handleSubmit}>
        {/* Only show the name input when the user is signing up */}
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

        {/* Show auth errors to the user when something goes wrong */}
        {error && <p>{error}</p>}

        <Button type="submit" disabled={isLoading}>
          {isLoading ? <Loading /> : buttonText}
        </Button>
      </form>

      {/* Let the user switch between login and signup */}
      <Button onClick={switchAuthMode}>
        {authMode === "login"
          ? "Need an account? Sign up"
          : "Already have an account? Log in"}
      </Button>
    </Modal>
  );
}

export default AuthModal;
