import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Note: this config (including apiKey) is safe to be public — Firebase
// secures data through server-side Firestore security rules, not by
// hiding this config. Real protection is set up in the Firestore rules
// (visitors can only create logs, only an authenticated admin can read).
const firebaseConfig = {
  apiKey: "AIzaSyC_Z1pJyZllWhMLkRCaaim08rkuPd7kIC0",
  authDomain: "database-ab92b.firebaseapp.com",
  projectId: "database-ab92b",
  storageBucket: "database-ab92b.firebasestorage.app",
  messagingSenderId: "692706064570",
  appId: "1:692706064570:web:8cbdf4500189abe5752a83",
  measurementId: "G-20KX49JRWW"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
