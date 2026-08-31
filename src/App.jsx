import React, { useEffect, useState } from "react";
import { auth, signInWithGoogle, signOutUser } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";

// This is a minimal starting point that proves Google sign-in works end to end.
// Once this is confirmed working (see the deployment guide), the next step is
// dropping the actual Atomic Six game code in here and wiring its matchmaking
// to Firestore instead of the old window.storage calls.
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) return <p style={{ fontFamily: "monospace", padding: 20 }}>Loading...</p>;

  return (
    <div style={{ fontFamily: "monospace", padding: 20 }}>
      <h1>ATOMIC SIX</h1>
      {user ? (
        <div>
          <p>Signed in as {user.displayName} ({user.email})</p>
          <button onClick={signOutUser}>Sign out</button>
          <p style={{ marginTop: 20, color: "#666" }}>
            Sign-in is working. Next: drop the game code in here.
          </p>
        </div>
      ) : (
        <button onClick={signInWithGoogle} style={{ padding: "10px 18px", fontFamily: "monospace" }}>
          Continue with Google
        </button>
      )}
    </div>
  );
}
