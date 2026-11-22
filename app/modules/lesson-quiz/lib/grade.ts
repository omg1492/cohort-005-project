import { eq } from "drizzle-orm";
import { quizAnswers, quizAttempts, quizzes } from "~/db/schema";
import { questionsWithOptions } from "./read";
import type { Db, QuestionResult, QuizResult } from "./types";

export function letterGrade(score: number): string {
  if (score >= 0.9) return "A";
  if (score >= 0.8) return "B";
  if (score >= 0.7) return "C";
  if (score >= 0.6) return "D";
  return "F";
}

function markQuestions(
  questions: ReturnType<typeof questionsWithOptions>,
  selectedAnswers: Record<number, number>
): QuestionResult[] {
  return questions.map((question) => {
    const selected = selectedAnswers[question.id];
    if (!selected) {
      return {
        questionId: question.id,
        correct: false,
        selectedOptionId: null,
        correctOptionId: null,
      };
    }
    const correctOptionId =
      question.options.find((o) => o.isCorrect)?.id ?? null;
    return {
      questionId: question.id,
      correct: selected === correctOptionId,
      selectedOptionId: selected,
      correctOptionId,
    };
  });
}

export type QuizSubmission = {
  studentId: number;
  quizId: number;
  selectedAnswers: Record<number, number>;
};

export function gradeAndRecord(
  db: Db,
  { studentId, quizId, selectedAnswers }: QuizSubmission
): QuizResult | null {
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
  if (!quiz) return null;

  const questionResults = markQuestions(
    questionsWithOptions(db, quizId),
    selectedAnswers
  );
  const totalQuestions = questionResults.length;
  const totalCorrect = questionResults.filter((r) => r.correct).length;
  const score = totalQuestions > 0 ? totalCorrect / totalQuestions : 0;
  // Passing is a fixed 70%, not quiz.passingScore: that is how it has always
  // been scored, and changing it is out of scope for this module's extraction.
  const passed = score > 0.7;

  const attemptId = db.transaction((tx) => {
    const attempt = tx
      .insert(quizAttempts)
      .values({ userId: studentId, quizId, score, passed })
      .returning()
      .get();
    for (const result of questionResults) {
      if (result.selectedOptionId === null) continue;
      tx.insert(quizAnswers)
        .values({
          attemptId: attempt.id,
          questionId: result.questionId,
          selectedOptionId: result.selectedOptionId,
        })
        .run();
    }
    return attempt.id;
  });

  return {
    attemptId,
    score,
    passed,
    grade: letterGrade(score),
    totalCorrect,
    totalQuestions,
    questionResults,
  };
}
