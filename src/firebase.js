// ============================================================================
// FIREBASE SETUP
// Paste your project's config here — you'll get this from the Firebase console
// (Project settings → General → "Your apps" → the web app's config snippet).
// It's safe for this to be visible in your public code; Firebase security
// comes from Firestore rules and Auth, not from hiding this object.
// ============================================================================
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBlzXtHpCfc22FKFK-u6IFnMFa55sLvwNk",
  authDomain: "atomic-six.firebaseapp.com",
  projectId: "atomic-six",
  storageBucket: "atomic-six.firebasestorage.app",
  messagingSenderId: "920582006710",
  appId: "1:920582006710:web:2e18f196b3d7307bf6c317",
  measurementId: "G-8HBHXNVYRS"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function signOutUser() {
  return signOut(auth);
}
