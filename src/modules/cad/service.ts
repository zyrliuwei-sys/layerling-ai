import { and, desc, eq, gt, isNull, lte, sql } from 'drizzle-orm';

import { affectedRows, db } from '@/core/db';
import { atomic, AtomicGuardError, guard } from '@/core/db/atomic';
import { cadProject, cadUsage } from '@/config/db/schema';
import type {
  CadProject,
  CadProjectInput,
  CadProjectSummary,
} from '@/lib/cad-api';
import { getUuid } from '@/lib/hash';

export class CadProjectConflictError extends Error {}
export class CadQuotaExceededError extends Error {}

type ProjectMetadata = Pick<
  typeof cadProject.$inferSelect,
  'id' | 'name' | 'revision' | 'createdAt' | 'updatedAt'
>;
const projectMetadata = {
  id: cadProject.id,
  name: cadProject.name,
  revision: cadProject.revision,
  createdAt: cadProject.createdAt,
  updatedAt: cadProject.updatedAt,
};

function summarize(row: ProjectMetadata): CadProjectSummary {
  return {
    ...row,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

function activeProjects(userId: string) {
  return and(eq(cadProject.userId, userId), isNull(cadProject.deletedAt));
}

export async function listProjects(
  userId: string
): Promise<CadProjectSummary[]> {
  const rows: ProjectMetadata[] = await db()
    .select(projectMetadata)
    .from(cadProject)
    .where(activeProjects(userId))
    .orderBy(desc(cadProject.updatedAt), desc(cadProject.id));
  return rows.map(summarize);
}

export async function readProject(
  userId: string,
  id: string
): Promise<CadProject | null> {
  const [row]: (ProjectMetadata &
    Pick<typeof cadProject.$inferSelect, 'versions' | 'currentIndex'>)[] =
    await db()
      .select({
        ...projectMetadata,
        versions: cadProject.versions,
        currentIndex: cadProject.currentIndex,
      })
      .from(cadProject)
      .where(and(activeProjects(userId), eq(cadProject.id, id)))
      .limit(1);
  if (!row) return null;

  const { versions, currentIndex, ...metadata } = row;
  return {
    ...summarize(metadata),
    index: currentIndex,
    versions: JSON.parse(versions),
  };
}

export async function saveProject(
  userId: string,
  input: CadProjectInput
): Promise<CadProject | null> {
  const { id, name, versions, index } = input;
  const updatedAt = new Date();
  const values = {
    name,
    versions: JSON.stringify(versions),
    currentIndex: index,
    updatedAt,
  };
  if (!id) {
    const row = {
      id: getUuid(),
      name,
      revision: 1,
      createdAt: updatedAt,
      updatedAt,
    };
    await db()
      .insert(cadProject)
      .values({ ...values, ...row, userId });
    return { ...summarize(row), versions, index };
  }

  const owned = and(activeProjects(userId), eq(cadProject.id, id));
  const [current]: ProjectMetadata[] = await db()
    .select(projectMetadata)
    .from(cadProject)
    .where(owned)
    .limit(1);
  if (!current) return null;
  if (input.revision !== current.revision) throw new CadProjectConflictError();

  const revision = current.revision + 1;
  const result = await db()
    .update(cadProject)
    .set({ ...values, revision })
    .where(and(owned, eq(cadProject.revision, current.revision)));
  if (affectedRows(result) !== 1) throw new CadProjectConflictError();
  return {
    ...summarize({ ...current, name, revision, updatedAt }),
    versions,
    index,
  };
}

export async function deleteProject(
  userId: string,
  id: string
): Promise<boolean> {
  const result = await db()
    .update(cadProject)
    .set({ deletedAt: new Date() })
    .where(and(activeProjects(userId), eq(cadProject.id, id)));
  return affectedRows(result) === 1;
}

const monthlyAiLimit = 5;

type CadUsagePeriod = {
  userId: string;
  period: string;
  limit: number;
  resetsAt: number;
};

export function getUsagePeriod(
  userId: string,
  now = new Date()
): CadUsagePeriod {
  return {
    userId,
    period: now.toISOString().slice(0, 7),
    limit: monthlyAiLimit,
    resetsAt: Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  };
}

function usagePeriod({ userId, period }: CadUsagePeriod) {
  return and(eq(cadUsage.userId, userId), eq(cadUsage.period, period));
}

export async function remainingOperations(
  period: CadUsagePeriod
): Promise<number> {
  const [row]: { used: number }[] = await db()
    .select({ used: cadUsage.used })
    .from(cadUsage)
    .where(usagePeriod(period))
    .limit(1);
  return Math.max(0, period.limit - (row?.used ?? 0));
}

export async function reserveOperation(period: CadUsagePeriod): Promise<void> {
  try {
    // The upsert and guard share one transaction. Concurrent calls cannot spend
    // the same last operation, and a rejected call restores the counter.
    await atomic((q) => [
      q
        .insert(cadUsage)
        .values({ userId: period.userId, period: period.period, used: 1 })
        .onConflictDoUpdate({
          target: [cadUsage.userId, cadUsage.period],
          set: { used: sql`${cadUsage.used} + 1` },
        }),
      guard({
        table: cadUsage,
        column: 'used',
        where: usagePeriod(period),
        require: lte(cadUsage.used, period.limit),
        message: 'Monthly CAD quota exhausted',
      }),
    ]);
  } catch (error) {
    if (error instanceof AtomicGuardError) throw new CadQuotaExceededError();
    throw error;
  }
}

export async function releaseOperation(period: CadUsagePeriod): Promise<void> {
  await db()
    .update(cadUsage)
    .set({ used: sql`${cadUsage.used} - 1` })
    .where(and(usagePeriod(period), gt(cadUsage.used, 0)));
}
