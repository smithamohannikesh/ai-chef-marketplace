import {
  collection,
  getDocs, onSnapshot,
} from "firebase/firestore";
import { db } from "./firebaseConfig";


import type { Chef } from "./chefTypes";

export async function getChefs(): Promise<Chef[]> {
  const snapshot = await getDocs(collection(db, "chef"));

  return snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  })) as Chef[];
}
//real-time listener function
//Fetches the chef list when the listener starts.
//Automatically sends updated data when a chef is added, edited, or deleted in Firebase.
//Reports errors through onError.
export function listenToChefs(
  onData: (chefs: Chef[]) => void,
  onError: (error: Error & { code?: string }) => void

) {
  return onSnapshot(
    collection(db, "chef"),
    (snapshot) => {
      const chefs = snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      })) as Chef[];

      onData(chefs);
    },
    onError
  );
}