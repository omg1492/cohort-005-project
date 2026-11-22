import { gradeAndRecord, type QuizSubmission } from "./lib/grade";
import { quizBelongsToLesson, readLessonQuiz } from "./lib/read";
import type { Db, LearnerQuiz, QuizResult } from "./lib/types";

export type { Db, LearnerQuiz, QuizResult, QuizSubmission };

/**
 * The quiz on a Lesson as the learner sees it — with the answer key stripped
 * so it never reaches the browser — and their best attempt so far.
 */
export function getLessonQuiz(
  db: Db,
  lessonId: number,
  studentId: number | null
): {
  quiz: LearnerQuiz | null;
  bestAttempt: { score: number; passed: boolean } | null;
} {
  return readLessonQuiz(db, lessonId, studentId);
}

/** Whether the quiz is the one on this Lesson, so a post can't reach another. */
export function isQuizOnLesson(
  db: Db,
  quizId: number,
  lessonId: number
): boolean {
  return quizBelongsToLesson(db, quizId, lessonId);
}

/**
 * Marks the learner's answers, records the attempt and its answers together,
 * and returns the result. Null when the quiz does not exist.
 */
export function submitQuizAttempt(
  db: Db,
  submission: QuizSubmission
): QuizResult | null {
  return gradeAndRecord(db, submission);
}
