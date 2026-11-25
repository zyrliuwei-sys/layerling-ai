import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const directory = await mkdtemp(join(tmpdir(), 'layerling-cad-test-'));
Object.assign(process.env, {
  DATABASE_PROVIDER: 'sqlite',
  DATABASE_URL: `file:${directory}/test.db`,
});
execFileSync(
  process.execPath,
  [
    'node_modules/drizzle-kit/bin.cjs',
    'push',
    '--dialect=sqlite',
    '--schema=./src/config/db/schema.sqlite.ts',
    `--url=${process.env.DATABASE_URL}`,
    '--force',
  ],
  { stdio: 'pipe', env: process.env }
);
const { db } = await import('../src/core/db');
const { cadUsage, subscription, user } =
  await import('../src/config/db/schema');
const { defaultEnclosure } = await import('../src/lib/cad-enclosure');
const service = await import('../src/modules/cad/service');

const owner = 'owner';
const other = 'other';
const now = new Date('2026-11-25T09:00:00.000Z');

before(async () => {
  await db()
    .insert(user)
    .values([
      { id: owner, name: 'Project owner', email: 'owner@example.test' },
      { id: other, name: 'Other member', email: 'other@example.test' },
    ]);
});

after(async () => rm(directory, { recursive: true, force: true }));

test('project history is private and stale concurrent saves cannot overwrite it', async () => {
  const versions = [defaultEnclosure, { ...defaultEnclosure, width: 120 }];
  const project = await service.saveProject(owner, {
    name: 'Sensor case',
    versions,
    index: 1,
  });
  assert.ok(project);
  assert.deepEqual(await service.listProjects(other), []);
  assert.equal(await service.readProject(other, project.id), null);
  assert.equal(
    await service.saveProject(other, { ...project, name: 'Unauthorized edit' }),
    null
  );
  assert.equal(await service.deleteProject(other, project.id), false);

  const edits = await Promise.allSettled([
    service.saveProject(owner, { ...project, name: 'Mechanical sample' }),
    service.saveProject(owner, { ...project, name: 'Print sample' }),
  ]);
  const successes = edits.filter((result) => result.status === 'fulfilled');
  const conflicts = edits.filter((result) => result.status === 'rejected');
  assert.equal(successes.length, 1);
  assert.equal(conflicts.length, 1);
  assert.ok(conflicts[0].reason instanceof service.CadProjectConflictError);

  const updated = await service.readProject(owner, project.id);
  assert.ok(updated);
  assert.deepEqual(updated.versions, versions);
  assert.equal(updated.index, 1);
  assert.equal(updated.revision, 2);
  assert.equal(await service.deleteProject(owner, project.id), true);
  assert.equal(await service.readProject(owner, project.id), null);
  assert.deepEqual(await service.listProjects(owner), []);
  assert.equal(
    await service.saveProject(owner, { ...updated, name: 'Cannot resurrect' }),
    null
  );
});

test('concurrent reservations enforce the monthly limit and reset at UTC month boundaries', async () => {
  const period = service.getUsagePeriod(owner, now);
  assert.equal(period.limit, 5);
  assert.equal(period.resetsAt, Date.UTC(2026, 11, 1));
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => service.reserveOperation(period))
  );
  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    5
  );
  for (const result of results) {
    if (result.status === 'rejected')
      assert.ok(result.reason instanceof service.CadQuotaExceededError);
  }
  assert.equal(await service.remainingOperations(period), 0);
  assert.equal((await db().select().from(cadUsage)).length, 1);

  await service.releaseOperation(period);
  assert.equal(await service.remainingOperations(period), 1);
  await service.reserveOperation(period);
  assert.equal(await service.remainingOperations(period), 0);
  const next = service.getUsagePeriod(owner, new Date(period.resetsAt));
  assert.equal(await service.remainingOperations(next), 5);
});

test('the same free AI allowance applies to accounts with historical subscriptions', async () => {
  await db()
    .insert(subscription)
    .values({
      id: 'previous-cad-plan',
      subscriptionNo: 'previous-cad-plan',
      userId: owner,
      status: 'active',
      subscriptionId: 'provider-pro',
      paymentProvider: 'stripe',
      productId: 'cad_pro_monthly',
      planName: 'Pro',
      currentPeriodEnd: new Date('2026-12-15T00:00:00Z'),
    });
  assert.equal(service.getUsagePeriod(owner, now).limit, 5);
  assert.equal(service.getUsagePeriod(other, now).limit, 5);
});
