/**
 * Production sets discrete PRISMA_HOST/PRISMA_PORT/PRISMA_USERNAME/PRISMA_PASSWORD/
 * PRISMA_DATABASE env vars rather than a single DATABASE_URL. Shared by
 * prisma.config.ts (CLI: migrate/generate) and PrismaService (runtime) so both
 * resolve the connection the same way. DATABASE_URL is kept as a fallback for
 * any environment that still sets it directly (e.g. a managed-Postgres URL with
 * extra connection params this shape can't express).
 *
 * Returns undefined — never throws — when neither is configured: `prisma
 * generate` (run from `postinstall` in CI, before deploy secrets exist) only
 * needs the schema, not a real connection, and must not fail here. Callers
 * that actually need a live connection (PrismaService at runtime) are
 * responsible for treating an undefined result as an error themselves.
 */
export function buildDatabaseUrl(): string | undefined {
  const { PRISMA_HOST, PRISMA_PORT, PRISMA_USERNAME, PRISMA_PASSWORD, PRISMA_DATABASE, DATABASE_URL } = process.env;

  if (PRISMA_HOST && PRISMA_PORT && PRISMA_USERNAME && PRISMA_PASSWORD && PRISMA_DATABASE) {
    const user = encodeURIComponent(PRISMA_USERNAME);
    const password = encodeURIComponent(PRISMA_PASSWORD);
    return `postgresql://${user}:${password}@${PRISMA_HOST}:${PRISMA_PORT}/${PRISMA_DATABASE}?schema=public`;
  }

  return DATABASE_URL;
}
