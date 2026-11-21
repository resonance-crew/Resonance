import type { ShadowFactory } from '@/server/app/shadow';

/**
 * The shadow backend from the environment: PostgreSQL when
 * `READ_BACKEND=shadow` and `POSTGRES_URL` are both set, else none (the
 * default — nothing set in production; PRIMARY_BACKEND stays firestore).
 * `pg` is loaded only when it is on.
 */
export function shadowFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): ShadowFactory | null {
  if (env.READ_BACKEND !== 'shadow' || !env.POSTGRES_URL) return null;
  return async (primary) => {
    const [{ withPostgres }, { envPgPool }] = await Promise.all([import('./postgres/ctx'), import('./postgres/pool')]);
    return withPostgres(primary, await envPgPool(env as NodeJS.ProcessEnv));
  };
}
