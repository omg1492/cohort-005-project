import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { submitQuizAttempt } from "../index.server";
import { addQuiz, quizWorld } from "./fixtures";

let world: ReturnType<typeof quizWorld>;

function quizOf(count: number) {
  return addQuiz(
    world.db,
    world.lessonIds[0],
    Array.from({ length: count }, (_, index) => ({
      text: `Question ${index + 1}`,
      options: ["right", "wrong"],
      correct: 0,
    }))
  );
}

function answer(quiz: ReturnType<typeof quizOf>, rightCount: number) {
  const selectedAnswers: Record<number, number> = {};
  quiz.questions.forEach((q, index) => {
    selectedAnswers[q.questionId] = q.optionIds[index < rightCount ? 0 : 1];
  });
  return submitQuizAttempt(world.db, {
    studentId: world.studentId,
    quizId: quiz.quizId,
    selectedAnswers,
  });
}

beforeEach(() => {
  world = quizWorld();
});

describe("submitQuizAttempt", () => {
  it("returns null for a quiz that does not exist", () => {
    expect(
      submitQuizAttempt(world.db, {
        studentId: world.studentId,
        quizId: 999,
        selectedAnswers: {},
      })
    ).toBe(null);
  });

  it("marks each question against its correct option", () => {
    const quiz = quizOf(2);
    const [first, second] = quiz.questions;
    const result = answer(quiz, 1);

    expect(result?.questionResults).toEqual(
      expect.arrayContaining([
        {
          questionId: first.questionId,
          correct: true,
          selectedOptionId: first.optionIds[0],
          correctOptionId: first.optionIds[0],
        },
        {
          questionId: second.questionId,
          correct: false,
          selectedOptionId: second.optionIds[1],
          correctOptionId: second.optionIds[0],
        },
      ])
    );
    expect(result).toMatchObject({
      totalCorrect: 1,
      totalQuestions: 2,
      score: 0.5,
    });
  });

  it("counts an unanswered question as wrong, without revealing its answer", () => {
    const quiz = quizOf(1);
    const result = submitQuizAttempt(world.db, {
      studentId: world.studentId,
      quizId: quiz.quizId,
      selectedAnswers: {},
    });
    expect(result?.questionResults).toEqual([
      {
        questionId: quiz.questions[0].questionId,
        correct: false,
        selectedOptionId: null,
        correctOptionId: null,
      },
    ]);
    expect(result?.score).toBe(0);
  });

  it("marks an answer wrong when the question has no correct option", () => {
    const quiz = addQuiz(world.db, world.lessonIds[0], [
      { text: "Trick question", options: ["a", "b"], correct: -1 },
    ]);
    const [question] = quiz.questions;
    const result = submitQuizAttempt(world.db, {
      studentId: world.studentId,
      quizId: quiz.quizId,
      selectedAnswers: { [question.questionId]: question.optionIds[0] },
    });
    expect(result?.questionResults[0]).toMatchObject({
      correct: false,
      correctOptionId: null,
    });
  });

  it("scores a quiz with no questions as zero", () => {
    expect(answer(quizOf(0), 0)).toMatchObject({
      score: 0,
      totalQuestions: 0,
      passed: false,
      grade: "F",
    });
  });

  it.each([
    [10, "A", true],
    [9, "A", true],
    [8, "B", true],
    [7, "C", false],
    [6, "D", false],
    [5, "F", false],
  ])("%i of 10 right grades %s, passed %s", (right, grade, passed) => {
    expect(answer(quizOf(10), right)).toMatchObject({ grade, passed });
  });

  it("records the attempt and each answered question", () => {
    const quiz = quizOf(2);
    const [first] = quiz.questions;
    const result = submitQuizAttempt(world.db, {
      studentId: world.studentId,
      quizId: quiz.quizId,
      selectedAnswers: { [first.questionId]: first.optionIds[0] },
    });

    const attempt = world.db
      .select()
      .from(schema.quizAttempts)
      .where(eq(schema.quizAttempts.id, result?.attemptId ?? -1))
      .get();
    expect(attempt).toMatchObject({
      userId: world.studentId,
      quizId: quiz.quizId,
      score: 0.5,
      passed: false,
    });
    const answers = world.db.select().from(schema.quizAnswers).all();
    expect(answers).toEqual([
      expect.objectContaining({
        attemptId: result?.attemptId,
        questionId: first.questionId,
        selectedOptionId: first.optionIds[0],
      }),
    ]);
  });
});
