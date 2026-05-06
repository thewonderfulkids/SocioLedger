import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
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

export const db = getDatabase(app);