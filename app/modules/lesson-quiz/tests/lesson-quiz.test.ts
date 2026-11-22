import { describe, it, expect, beforeEach } from "vitest";
import {
  getLessonQuiz,
  isQuizOnLesson,
  submitQuizAttempt,
} from "../index.server";
import { addQuiz, quizWorld } from "./fixtures";

let world: ReturnType<typeof quizWorld>;

const TWO_QUESTIONS = [
  { text: "Is TS a superset of JS?", options: ["Yes", "No"], correct: 0 },
  { text: "Which keyword?", options: ["var", "let", "type"], correct: 2 },
];

beforeEach(() => {
  world = quizWorld();
});

describe("getLessonQuiz", () => {
  it("returns nothing for a Lesson without a quiz", () => {
    expect(getLessonQuiz(world.db, world.lessonIds[0], null)).toEqual({
      quiz: null,
      bestAttempt: null,
    });
  });

  it("returns questions in position order with the answer key stripped", () => {
    const { quizId, questions } = addQuiz(
      world.db,
      world.lessonIds[0],
      TWO_QUESTIONS
    );
    const { quiz } = getLessonQuiz(world.db, world.lessonIds[0], null);

    expect(quiz).toMatchObject({
      id: quizId,
      title: "Check yourself",
      passingScore: 0.7,
    });
    expect(quiz?.questions.map((q) => q.id)).toEqual([
      questions[1].questionId,
      questions[0].questionId,
    ]);
    expect(quiz?.questions[1]).toEqual({
      id: questions[0].questionId,
      questionText: "Is TS a superset of JS?",
      questionType: "multiple_choice",
      position: 2,
      options: [
        { id: questions[0].optionIds[0], optionText: "Yes" },
        { id: questions[0].optionIds[1], optionText: "No" },
      ],
    });
  });

  it("has no best attempt for someone signed out or who never tried", () => {
    addQuiz(world.db, world.lessonIds[0], TWO_QUESTIONS);
    expect(getLessonQuiz(world.db, world.lessonIds[0], null).bestAttempt).toBe(
      null
    );
    expect(
      getLessonQuiz(world.db, world.lessonIds[0], world.studentId).bestAttempt
    ).toBe(null);
  });

  it("reports the Student's highest-scoring attempt", () => {
    const { quizId, questions } = addQuiz(
      world.db,
      world.lessonIds[0],
      TWO_QUESTIONS
    );
    const [first, second] = questions;
    const submit = (answers: Record<number, number>) =>
      submitQuizAttempt(world.db, {
        studentId: world.studentId,
        quizId,
        selectedAnswers: answers,
      });
    submit({ [first.questionId]: first.optionIds[0] });
    submit({
      [first.questionId]: first.optionIds[0],
      [second.questionId]: second.optionIds[2],
    });
    submit({});

    expect(
      getLessonQuiz(world.db, world.lessonIds[0], world.studentId).bestAttempt
    ).toEqual({ score: 1, passed: true });
  });
});

it("returns a quiz with no questions yet", () => {
  addQuiz(world.db, world.lessonIds[0], []);
  expect(
    getLessonQuiz(world.db, world.lessonIds[0], null).quiz?.questions
  ).toEqual([]);
});

describe("isQuizOnLesson", () => {
  it("is true only for the quiz on that Lesson", () => {
    const { quizId } = addQuiz(world.db, world.lessonIds[0], TWO_QUESTIONS);
    expect(isQuizOnLesson(world.db, quizId, world.lessonIds[0])).toBe(true);
    expect(isQuizOnLesson(world.db, quizId, world.lessonIds[1])).toBe(false);
    expect(isQuizOnLesson(world.db, quizId + 1, world.lessonIds[0])).toBe(
      false
    );
  });
});
