import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';

const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
if (
  !databaseId ||
  !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(databaseId)
) {
  throw new Error('CLOUDFLARE_D1_DATABASE_ID must be a D1 database UUID.');
}

const hostname = 'layerling.org';
const name = 'layerling-ai';
const vars = {
  DATABASE_PROVIDER: 'd1',
  VITE_APP_URL: `https://${hostname}`,
  VITE_APP_NAME: 'layerling ai',
  VITE_APP_DESCRIPTION: 'Describe, edit, and export 3D-printable CAD models.',
};
const config = {
  name,
  compatibility_date: '2026-10-01',
  compatibility_flags: ['nodejs_compat'],
  observability: { enabled: true },
  workers_dev: false,
  preview_urls: false,
  routes: [{ pattern: hostname, custom_domain: true }],
  vars,
  d1_databases: [
    {
      binding: 'DB',
      database_name: name,
      database_id: databaseId,
      migrations_dir: 'drizzle',
    },
  ],
};

// Nitro reads the root config and passes it to Wrangler via the build output.
const configPath = new URL('../wrangler.jsonc', import.meta.url);
writeFileSync(configPath, JSON.stringify(config, null, 2), { flag: 'wx' });
try {
  const result = spawnSync(
    'pnpm',
    ['run', 'cf:deploy', ...process.argv.slice(2)],
    {
      env: { ...process.env, ...vars },
      stdio: 'inherit',
    }
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(configPath);
}
