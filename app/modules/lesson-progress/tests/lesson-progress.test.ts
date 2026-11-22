import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { LessonProgressStatus } from "~/db/schema";
import { completeLesson, visitLesson } from "../index.server";

const NOW = new Date("2026-10-06T12:00:00.000Z");

let db: TestDb;
let studentId: number;
let courseId: number;
let lessonIds: number[];
let otherCourseLessonId: number;

function addLesson(moduleCourseId: number, position: number) {
  const mod = db
    .insert(schema.modules)
    .values({ courseId: moduleCourseId, title: "Module", position })
    .returning()
    .get();
  return db
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: `Lesson ${position}`, position })
    .returning()
    .get().id;
}

// Watch events are written by the video tracking endpoint, which this module
// does not own, so the test stores them the way that endpoint does.
function watched(lessonId: number, positionSeconds: number, at: string) {
  db.insert(schema.videoWatchEvents)
    .values({
      userId: studentId,
      lessonId,
      eventType: "progress",
      positionSeconds,
      createdAt: at,
    })
    .run();
}

function visit(lessonId: number, videoDurationSeconds: number | null = null) {
  return visitLesson(db, {
    studentId,
    lessonId,
    courseId,
    videoDurationSeconds,
  });
}

beforeEach(() => {
  db = createTestDb();
  const base = seedBaseData(db);
  studentId = base.user.id;
  courseId = base.course.id;
  lessonIds = [1, 2].map((position) => addLesson(courseId, position));
  const otherCourse = db
    .insert(schema.courses)
    .values({ ...base.course, id: undefined, slug: "other-course" })
    .returning()
    .get();
  otherCourseLessonId = addLesson(otherCourse.id, 1);
});

describe("visitLesson", () => {
  it("marks a first visit in progress", () => {
    const view = visit(lessonIds[0]);
    expect(view.lessonStatus).toBe(LessonProgressStatus.InProgress);
    expect(view.lessonProgressMap).toEqual({
      [lessonIds[0]]: LessonProgressStatus.InProgress,
    });
  });

  it("does not add a second progress row on a repeat visit", () => {
    visit(lessonIds[0]);
    visit(lessonIds[0]);
    expect(db.select().from(schema.lessonProgress).all()).toHaveLength(1);
  });

  it("leaves a completed Lesson completed", () => {
    completeLesson(db, { studentId, lessonId: lessonIds[0] }, NOW);
    expect(visit(lessonIds[0]).lessonStatus).toBe(
      LessonProgressStatus.Completed
    );
  });

  it("maps progress across this course only", () => {
    completeLesson(db, { studentId, lessonId: lessonIds[1] }, NOW);
    visit(otherCourseLessonId);
    expect(visit(lessonIds[0]).lessonProgressMap).toEqual({
      [lessonIds[0]]: LessonProgressStatus.InProgress,
      [lessonIds[1]]: LessonProgressStatus.Completed,
    });
  });

  it("reports nothing about video for a Lesson without one", () => {
    watched(lessonIds[0], 90, "2026-10-06T11:00:00.000Z");
    expect(visit(lessonIds[0], null)).toMatchObject({
      lastWatchPosition: 0,
      watchProgress: 0,
    });
  });

  it("resumes from the latest position and reports the furthest reached", () => {
    watched(lessonIds[0], 150, "2026-10-06T10:00:00.000Z");
    watched(lessonIds[0], 30, "2026-10-06T11:00:00.000Z");
    watched(lessonIds[1], 290, "2026-10-06T11:30:00.000Z");
    expect(visit(lessonIds[0], 300)).toMatchObject({
      lastWatchPosition: 30,
      watchProgress: 50,
    });
  });

  it("caps watch progress at 100%", () => {
    watched(lessonIds[0], 400, "2026-10-06T10:00:00.000Z");
    expect(visit(lessonIds[0], 300).watchProgress).toBe(100);
  });

  it("reports no watch progress for a video of no length", () => {
    watched(lessonIds[0], 30, "2026-10-06T10:00:00.000Z");
    expect(visit(lessonIds[0], 0)).toMatchObject({
      lastWatchPosition: 30,
      watchProgress: 0,
    });
  });

  it("starts an unwatched video at the beginning", () => {
    expect(visit(lessonIds[0], 300)).toMatchObject({
      lastWatchPosition: 0,
      watchProgress: 0,
    });
  });
});

describe("completeLesson", () => {
  it("completes a Lesson never visited, stamped with the given time", () => {
    completeLesson(db, { studentId, lessonId: lessonIds[0] }, NOW);
    expect(db.select().from(schema.lessonProgress).all()).toEqual([
      expect.objectContaining({
        userId: studentId,
        lessonId: lessonIds[0],
        status: LessonProgressStatus.Completed,
        completedAt: NOW.toISOString(),
      }),
    ]);
  });

  it("completes a Lesson already in progress without a second row", () => {
    visit(lessonIds[0]);
    completeLesson(db, { studentId, lessonId: lessonIds[0] }, NOW);
    const rows = db.select().from(schema.lessonProgress).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: LessonProgressStatus.Completed,
      completedAt: NOW.toISOString(),
    });
  });
});
