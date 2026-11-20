/**
 * Firestore's native KNN on `cardVectors`: the adapter lives in
 * src/server/infra/firestore/vectors.ts (only infra imports the admin SDK).
 * This path stays for the emulator suites and scripts that make one
 * (`new FirestoreVectorStore(db)`).
 */
export { FirestoreVectorStore, vectorDocId } from '@/server/infra/firestore/vectors';
