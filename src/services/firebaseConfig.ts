import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
 apiKey: "AIzaSyCaLyOzTjQhyEZYPJr5tCkAB13-ab1gdjo",
  authDomain: "ai-chef-marketplace-240ad.firebaseapp.com",
  projectId: "ai-chef-marketplace-240ad",
  storageBucket: "ai-chef-marketplace-240ad.firebasestorage.app",
  messagingSenderId: "687957383540",
  appId: "1:687957383540:web:59d07405fa401885ba3421"
};

const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();

export const db = getFirestore(app);