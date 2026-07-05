/**
 * FIREBASE CONFIG
 * ----------------
 * 1. Create a project at https://console.firebase.google.com
 * 2. Enable Authentication -> Sign-in method -> Google
 * 3. Enable Firestore Database (production mode)
 * 4. Copy your web app config below.
 * 5. For the native Android/iOS build via Capacitor, also install
 *    @capacitor-firebase/authentication and drop in google-services.json /
 *    GoogleService-Info.plist (see README.md).
 */
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const fbAuth = firebase.auth();
const fbDb = firebase.firestore();

// Persist auth across app restarts (important for a field app with spotty connectivity)
fbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((e) => console.warn("Auth persistence not set:", e));
