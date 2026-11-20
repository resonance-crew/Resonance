// The emulators' folder standing in for the bucket lives in the middle layer
// now (src/server/infra/s3/local.ts); this path stays for the scripts, the
// dev server's emulator-storage route and the tests that import it.
export { againstEmulators, LOCAL_STORAGE_PATH, localContentType, LocalStorageProvider, localStorageRoot } from '@/server/infra/s3/local';
