import { useSession, signOut } from "./lib/auth-client.js";
import { SignIn } from "./SignIn.js";

export function App() {
  const { data: session, isPending } = useSession();

  if (isPending) return <p>Loading…</p>;

  if (!session) {
    return (
      <main>
        <h1>Headless LMS</h1>
        <SignIn />
      </main>
    );
  }

  return (
    <main>
      <h1>Headless LMS</h1>
      <p>Signed in as {session.user.email}</p>
      <button onClick={() => signOut()}>Sign out</button>
    </main>
  );
}
