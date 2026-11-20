// R2 lives in the middle layer now (src/server/infra/s3/r2.ts, the only place
// the AWS SDK is used); this path stays for the scripts and routes that import it.
export { R2StorageProvider, r2Client } from '@/server/infra/s3/r2';
export { IMMUTABLE, objectKey } from '@/server/infra/s3/keys';
