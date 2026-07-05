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
// Your web app's Firebase configuration
  const firebaseConfig = {
  apiKey: "AIzaSyAL7UAXIWLsd_br2AXtZ_9JTdmkrEDfV9c",
  authDomain: "lao-field-gis.firebaseapp.com",
  projectId: "lao-field-gis",
  storageBucket: "lao-field-gis.firebasestorage.app",
  messagingSenderId: "807413471869",
  appId: "1:807413471869:web:4aefa7a62e5531549aef14"
};

firebase.initializeApp(firebaseConfig);
const fbAuth = firebase.auth();
const fbDb = firebase.firestore();

// Persist auth across app restarts (important for a field app with spotty connectivity)
fbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((e) => console.warn("Auth persistence not set:", e));
