import { useState, type FormEvent } from "react";
import { signIn, signUp } from "./lib/auth-client.js";

// Minimal auth UI exercising both enabled methods: email+password and magic link.
export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [status, setStatus] = useState<string | null>(null);

  async function onPasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    const result =
      mode === "signup"
        ? await signUp.email({ email, password, name })
        : await signIn.email({ email, password });
    setStatus(result.error ? result.error.message ?? "Failed" : "Signed in");
  }

  async function onMagicLink() {
    setStatus(null);
    const result = await signIn.magicLink({ email, callbackURL: "/" });
    setStatus(result.error ? result.error.message ?? "Failed" : "Check your email for a sign-in link");
  }

  return (
    <form onSubmit={onPasswordSubmit}>
      <h2>{mode === "signup" ? "Create account" : "Sign in"}</h2>
      {mode === "signup" && (
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      )}
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <button type="submit">{mode === "signup" ? "Sign up" : "Sign in"}</button>
      <button type="button" onClick={onMagicLink}>
        Email me a magic link
      </button>
      <button type="button" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>
        {mode === "signup" ? "Have an account? Sign in" : "Need an account? Sign up"}
      </button>
      {status && <p>{status}</p>}
    </form>
  );
}
