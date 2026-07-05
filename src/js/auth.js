/**
 * Auth flow:
 *  1. Google Sign-In via Firebase Auth (popup on web; on native builds swap
 *     to @capacitor-firebase/authentication's signInWithGoogle(), which
 *     triggers the native Google account chooser).
 *  2. After sign-in, look up users/{uid} in Firestore.
 *     - If missing -> force onboarding screen (Full Name + Country).
 *     - If present -> go straight to the map.
 */
const Auth = (() => {
  const googleProvider = new firebase.auth.GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: "select_account" });

  async function signIn() {
    // NOTE: on a Capacitor native build, replace this block with:
    //   import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
    //   const result = await FirebaseAuthentication.signInWithGoogle();
    //   -> then sign in to the Firebase JS SDK with result.credential
    // so the OS-native Google account picker is used instead of a web popup.
    try {
      const result = await fbAuth.signInWithPopup(googleProvider);
      return result.user;
    } catch (err) {
      if (err.code === "auth/popup-blocked" || err.code === "auth/cancelled-popup-request") {
        // Fallback for mobile browsers that block popups
        await fbAuth.signInWithRedirect(googleProvider);
        return null;
      }
      throw err;
    }
  }

  function signOut() {
    return fbAuth.signOut();
  }

  function onAuthChanged(cb) {
    return fbAuth.onAuthStateChanged(cb);
  }

  async function getProfile(uid) {
    const doc = await fbDb.collection("users").doc(uid).get();
    return doc.exists ? doc.data() : null;
  }

  async function saveProfile(uid, profile) {
    await fbDb.collection("users").doc(uid).set(profile, { merge: true });
  }

  return { signIn, signOut, onAuthChanged, getProfile, saveProfile };
})();
