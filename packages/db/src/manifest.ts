import type { MigrationManifest } from "./types.js";

// Every migration the runner applies, in order, with the sha256 of its file.
// `pnpm --filter @saas/db run manifest:check` verifies the checksums;
// `manifest:fix` rewrites them after a migration file changes (only ever
// before that migration has been applied anywhere — an applied migration's
// checksum is immutable).
export const manifest: MigrationManifest = {
  version: 1,
  migrations: [
    {
      id: "000_control_baseline",
      context: "control",
      path: "000_control/up.sql",
      checksum:
        "c7f11499fa82d6fd2baa1af7fc75eeb73cd7be252af2e56841509c66001d638b",
      description:
        "Baseline control migration — creates the migration tracking schema",
    },
    {
      id: "010_emojis",
      context: "app",
      path: "010_emojis/up.sql",
      checksum:
        "2dd94a0a578fef4c5c0c2db1f1e227e55007d05c7bf0981399969ababa81f47b",
      description:
        "The emojis (the template's Emoji model on SQLite) and the full-text index of their prompts",
    },
    {
      id: "020_app_secrets",
      context: "app",
      path: "020_app_secrets/up.sql",
      checksum:
        "a1d5477e85aad1e2465c6bebffbb8c656b30e70fcb91b1e155f0c52fceb7d26b",
      description:
        "The API secret the rate-limit tokens are signed with, generated once per database and never typed",
    },
  ],
};
