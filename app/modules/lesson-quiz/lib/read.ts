import { and, desc, eq, inArray } from "drizzle-orm";
import { quizAttempts, quizOptions, quizQuestions, quizzes } from "~/db/schema";
import type { Db, LearnerQuiz } from "./types";

export function questionsWithOptions(db: Db, quizId: number) {
  const questions = db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.position)
    .all();
  const options = db
    .select()
    .from(quizOptions)
    .where(
      inArray(
        quizOptions.questionId,
        questions.map((q) => q.id)
      )
    )
    .orderBy(quizOptions.id)
    .all();
  return questions.map((question) => ({
    ...question,
    options: options.filter((o) => o.questionId === question.id),
  }));
}

function toLearnerQuiz(
  quiz: typeof quizzes.$inferSelect,
  questions: ReturnType<typeof questionsWithOptions>
): LearnerQuiz {
  return {
    id: quiz.id,
    title: quiz.title,
    passingScore: quiz.passingScore,
    questions: questions.map((q) => ({
      id: q.id,
      questionText: q.questionText,
      questionType: q.questionType,
      position: q.position,
      options: q.options.map((o) => ({ id: o.id, optionText: o.optionText })),
    })),
  };
}

function bestAttempt(db: Db, studentId: number, quizId: number) {
  const best = db
    .select()
    .from(quizAttempts)
    .where(
      and(eq(quizAttempts.userId, studentId), eq(quizAttempts.quizId, quizId))
    )
    .orderBy(desc(quizAttempts.score))
    .limit(1)
    .get();
  return best ? { score: best.score, passed: best.passed } : null;
}

export function readLessonQuiz(
  db: Db,
  lessonId: number,
  studentId: number | null
) {
  const quiz = db
    .select()
    .from(quizzes)
    .where(eq(quizzes.lessonId, lessonId))
    .get();
  if (!quiz) return { quiz: null, bestAttempt: null };
  return {
    quiz: toLearnerQuiz(quiz, questionsWithOptions(db, quiz.id)),
    bestAttempt:
      studentId === null ? null : bestAttempt(db, studentId, quiz.id),
  };
}

export function quizBelongsToLesson(db: Db, quizId: number, lessonId: number) {
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
  return quiz !== undefined && quiz.lessonId === lessonId;
}
