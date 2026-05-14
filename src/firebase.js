import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
} from "firebase/app-check";

export const firebaseConfig = {
  apiKey: "AIzaSyDfEVbf8vksNEUCjjPc3DQItdjDs7XvXVY",
  authDomain: "socioledger-8e2f6.firebaseapp.com",
  databaseURL:
    "https://socioledger-8e2f6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "socioledger-8e2f6",
  storageBucket: "socioledger-8e2f6.firebasestorage.app",
  messagingSenderId: "1093218635013",
  appId: "1:1093218635013:web:92a1a93f1b4ffd89747b6c",
  measurementId: "G-ZZ4NSVDRCF",
};

const app = initializeApp(firebaseConfig);

initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(
    "6LdoAuQsAAAAAOsW8wKaqdHiYj20X7rn4hvtrsDD"
  ),
  isTokenAutoRefreshEnabled: true,
});

export const db = getDatabase(app);
export const auth = getAuth(app);