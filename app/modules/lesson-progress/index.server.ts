import {
  courseProgressMap,
  lastWatchPosition,
  markComplete,
  markInProgress,
  watchPercent,
  type Db,
} from "./lib/progress";

export type { Db };

export type LessonVisit = {
  studentId: number;
  lessonId: number;
  courseId: number;
  /** Null when the Lesson has no video. */
  videoDurationSeconds: number | null;
};

export type LessonProgressView = {
  lessonStatus: string;
  lessonProgressMap: Record<number, string>;
  lastWatchPosition: number;
  watchProgress: number;
};

/**
 * A Student opened a Lesson: mark it in progress (a completed Lesson stays
 * completed) and return what the page shows about their progress.
 */
export function visitLesson(db: Db, visit: LessonVisit): LessonProgressView {
  const ref = { studentId: visit.studentId, lessonId: visit.lessonId };
  const progress = markInProgress(db, ref);
  const duration = visit.videoDurationSeconds;
  return {
    lessonStatus: progress.status,
    lessonProgressMap: courseProgressMap(db, visit.studentId, visit.courseId),
    lastWatchPosition: duration === null ? 0 : lastWatchPosition(db, ref),
    watchProgress: watchPercent(db, ref, duration ?? 0),
  };
}

/** The Student finished the Lesson at `now`. */
export function completeLesson(
  db: Db,
  ref: { studentId: number; lessonId: number },
  now: Date
): void {
  markComplete(db, ref, now);
}
