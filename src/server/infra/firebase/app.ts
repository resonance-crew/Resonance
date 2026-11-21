import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';

/**
 * The one Firebase Admin app every Firebase adapter shares — Firestore
 * (infra/firestore/db.ts), Auth (infra/firebase-auth), App Check
 * (infra/appcheck) and FCM: made by whichever asks first, from the service
 * account in the environment (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
 * `FIREBASE_PRIVATE_KEY`), else the machine's default credentials.
 */

function privateKey() {
  return process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
}

function firebaseAdminConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const key = privateKey();

  if (projectId && clientEmail && key) {
    return {
      credential: cert({ projectId, clientEmail, privateKey: key }),
      projectId,
    };
  }

  return {
    credential: applicationDefault(),
    projectId,
  };
}

/** Make the default admin app, unless something already did. */
export function ensureAdminApp(): void {
  if (!getApps().length) initializeApp(firebaseAdminConfig());
}
