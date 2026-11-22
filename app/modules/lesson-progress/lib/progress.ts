import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, desc, eq, sql } from "drizzle-orm";
import type * as schema from "~/db/schema";
import {
  lessonProgress,
  lessons,
  modules,
  videoWatchEvents,
  LessonProgressStatus,
} from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

export type StudentLesson = { studentId: number; lessonId: number };

export function findProgress(db: Db, { studentId, lessonId }: StudentLesson) {
  return db
    .select()
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, studentId),
        eq(lessonProgress.lessonId, lessonId)
      )
    )
    .get();
}

export function markInProgress(db: Db, ref: StudentLesson) {
  const existing = findProgress(db, ref);
  if (existing?.status === LessonProgressStatus.Completed) return existing;
  if (existing) {
    return db
      .update(lessonProgress)
      .set({ status: LessonProgressStatus.InProgress })
      .where(eq(lessonProgress.id, existing.id))
      .returning()
      .get();
  }
  return db
    .insert(lessonProgress)
    .values({
      userId: ref.studentId,
      lessonId: ref.lessonId,
      status: LessonProgressStatus.InProgress,
    })
    .returning()
    .get();
}

export function markComplete(db: Db, ref: StudentLesson, now: Date) {
  const completed = {
    status: LessonProgressStatus.Completed,
    completedAt: now.toISOString(),
  };
  const existing = findProgress(db, ref);
  if (existing) {
    return db
      .update(lessonProgress)
      .set(completed)
      .where(eq(lessonProgress.id, existing.id))
      .returning()
      .get();
  }
  return db
    .insert(lessonProgress)
    .values({ userId: ref.studentId, lessonId: ref.lessonId, ...completed })
    .returning()
    .get();
}

export function courseProgressMap(db: Db, studentId: number, courseId: number) {
  const rows = db
    .select({
      lessonId: lessonProgress.lessonId,
      status: lessonProgress.status,
    })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(
      and(eq(lessonProgress.userId, studentId), eq(modules.courseId, courseId))
    )
    .all();
  const map: Record<number, string> = {};
  for (const row of rows) map[row.lessonId] = row.status;
  return map;
}

export function lastWatchPosition(db: Db, ref: StudentLesson) {
  const lastEvent = db
    .select()
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, ref.studentId),
        eq(videoWatchEvents.lessonId, ref.lessonId)
      )
    )
    .orderBy(desc(videoWatchEvents.createdAt))
    .limit(1)
    .get();
  return lastEvent?.positionSeconds ?? 0;
}

export function watchPercent(
  db: Db,
  ref: StudentLesson,
  videoDurationSeconds: number
) {
  if (videoDurationSeconds <= 0) return 0;
  const result = db
    .select({ maxPos: sql<number>`max(${videoWatchEvents.positionSeconds})` })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, ref.studentId),
        eq(videoWatchEvents.lessonId, ref.lessonId)
      )
    )
    .get();
  const maxPosition = result?.maxPos ?? 0;
  return Math.min(Math.round((maxPosition / videoDurationSeconds) * 100), 100);
}
