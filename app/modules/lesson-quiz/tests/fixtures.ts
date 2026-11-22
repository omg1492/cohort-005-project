import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { QuestionType } from "~/db/schema";

// Quizzes are authored on the instructor's quiz page, which this module does
// not own, so the fixture writes the rows the way that page stores them.
export function quizWorld() {
  const db: TestDb = createTestDb();
  const base = seedBaseData(db);
  const mod = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  const lessonIds = [1, 2].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: mod.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
  return { db, studentId: base.user.id, lessonIds };
}

type QuestionSpec = { text: string; options: string[]; correct: number };

export function addQuiz(
  db: TestDb,
  lessonId: number,
  questions: QuestionSpec[]
) {
  const quiz = db
    .insert(schema.quizzes)
    .values({ lessonId, title: "Check yourself", passingScore: 0.7 })
    .returning()
    .get();
  const created = questions.map((spec, index) => {
    const question = db
      .insert(schema.quizQuestions)
      .values({
        quizId: quiz.id,
        questionText: spec.text,
        questionType: QuestionType.MultipleChoice,
        // Inserted in reverse so the read order must come from `position`.
        position: questions.length - index,
      })
      .returning()
      .get();
    const optionIds = spec.options.map(
      (optionText, optionIndex) =>
        db
          .insert(schema.quizOptions)
          .values({
            questionId: question.id,
            optionText,
            isCorrect: optionIndex === spec.correct,
          })
          .returning()
          .get().id
    );
    return { questionId: question.id, optionIds };
  });
  return { quizId: quiz.id, questions: created };
}
