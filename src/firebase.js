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
import { getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "AIzaSyBlzXtHpCfc22FKFK-u6IFnMFa55sLvwNk",
  authDomain: "atomic-six.firebaseapp.com",
  projectId: "atomic-six",
  storageBucket: "atomic-six.appspot.com",
  messagingSenderId: "920582006710",
  appId: "1:920582006710:web:2e18f196b3d7307bf6c317",
};

const app = initializeApp(firebaseConfig);

// ----------------------------------------------------------------------
// APP CHECK — proves to the Cloud Functions in functions/index.js that a
// call is really coming from this deployed app, not a script hitting the
// function URL directly. Every function there has enforceAppCheck: true,
// so without this, legitimate calls would start failing too - this has to
// be set up for both sides to work together. Two things you must do in the
// Firebase console before this does anything (see DEPLOYMENT_GUIDE.md):
//   1. Create a reCAPTCHA Enterprise "Web" key (score-based, NOT checkbox)
//      for this domain at https://console.cloud.google.com/security/recaptcha
//      and paste its key ID below. App Check registration in the Firebase
//      console now asks for a reCAPTCHA Enterprise key, not the older
//      standalone reCAPTCHA v3 admin console key.
//   2. In the Firebase console under Security → App Check, register this
//      web app with that same key, and enforce App Check for the
//      "default" Cloud Functions codebase.
// During local development (localhost), App Check needs a debug token -
// DEPLOYMENT_GUIDE.md covers that too, since without it every function
// call will fail locally once enforceAppCheck is live.
// ----------------------------------------------------------------------
initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider("6LcFjtktAAAAAPDUwUke6EmqjkoQKNYokXjmBFNU"),
  isTokenAutoRefreshEnabled: true,
});

export const auth = getAuth(app);
export const db = getFirestore(app);
// Cloud Functions client - used for everything that touches Bullets or
// unlocks (see functions/index.js). The client never writes those fields
// to Firestore directly anymore; it calls one of these functions instead,
// and the function (running server-side with the Admin SDK) decides what
// the real new value is.
export const functions = getFunctions(app);

const googleProvider = new GoogleAuthProvider();

export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function signOutUser() {
  return signOut(auth);
}
