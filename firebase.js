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
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY_HERE",
  authDomain: "PASTE_YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);

// ----------------------------------------------------------------------
// APP CHECK — proves to the Cloud Functions in functions/index.js that a
// call is really coming from this deployed app, not a script hitting the
// function URL directly. Every function there has enforceAppCheck: true,
// so without this, legitimate calls would start failing too - this has to
// be set up for both sides to work together. Two things you must do in the
// Firebase console before this does anything (see DEPLOYMENT_GUIDE.md):
//   1. Register a reCAPTCHA v3 site key for this domain at
//      https://www.google.com/recaptcha/admin and paste it below.
//   2. In the Firebase console under Build → App Check, register this web
//      app with that same site key, and enforce App Check for the
//      "default" Cloud Functions codebase.
// During local development (localhost), App Check needs a debug token -
// DEPLOYMENT_GUIDE.md covers that too, since without it every function
// call will fail locally once enforceAppCheck is live.
// ----------------------------------------------------------------------
initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider("PASTE_YOUR_RECAPTCHA_V3_SITE_KEY"),
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
