import { useState, type SyntheticEvent } from "react";
import { supabase } from "../supabaseClient";
import Button from "./ui/Button";
import Modal from "./ui/Modal";
import Loading from "./ui/Loading";

//controls whether this modal is being used to log in or sign up
type AuthMode = "login" | "signup";

//props from App.tsx
type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (name: string) => void;
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
};

//renders the sign in/log in form and handles Supabase auth
function AuthModal({
  isOpen,
  onClose,
  onAuthSuccess,
  authMode,
  setAuthMode,
}: AuthModalProps) {
  //local state tracking form inputs, error message, and loading status
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const resetForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setError("");
  };

  const switchAuthMode = () => {
    setAuthMode(authMode === "login" ? "signup" : "login");
    resetForm();
  };

  //the submit button changes based on user logging in or signing up
  const buttonText = authMode === "login" ? "Log In" : "Sign Up";

  //handleSubmit runs when the form is submitted and chooses the correct flow
  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      //Signup creates a new Supabse Auth user and sends username as metadata
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

        //stop early if Supabase could not create the user
        if (signUpError) {
          setError(signUpError.message);
          return;
        }

        if (!user) {
          setError("Could not create user.");
          return;
        }

        //Tell App.tsx signup succeeded and send back the name to display
        onAuthSuccess(name);
      } else {
        //Login authenticates an exiting user with email and password
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

        //After login, fetch the user's profile so App.tsx can display their username
        const profileResponse = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();

        const profile = profileResponse.data;
        const profileError = profileResponse.error;

        //Stop early if the profile or username cannot be found
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

        //Tell App.tsx login succeeded and send back the username to display
        onAuthSuccess(profile.username);
      }
      //Catch unexplected errors like network issues or thrown Supabase errors
    } catch (err) {
      console.error("Auth failed:", err);
      setError("Something went wrong. Please try again.");
      //always turn loading off after the auth attempt finishes
    } finally {
      setIsLoading(false);
    }
  }

  //Render the shared Modal wrapper with the auth form inside it
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
