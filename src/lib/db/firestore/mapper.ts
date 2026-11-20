// Firestore documents → the app's types: Firestore's own code, so it lives in
// src/server/infra/firestore/mapper.ts (only infra imports firebase-admin);
// this path stays for its importers.
export { fromDate, mapCard, mapConnection, mapNotification, mapUser, sanitize, toDate, toNullableDate } from '@/server/infra/firestore/mapper';
