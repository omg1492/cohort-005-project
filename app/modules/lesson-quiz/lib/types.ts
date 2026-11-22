import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

/** A quiz as a learner may see it: the options carry no answer key. */
export type LearnerQuiz = {
  id: number;
  title: string;
  passingScore: number;
  questions: Array<{
    id: number;
    questionText: string;
    questionType: string;
    position: number;
    options: Array<{ id: number; optionText: string }>;
  }>;
};

export type QuestionResult = {
  questionId: number;
  correct: boolean;
  selectedOptionId: number | null;
  correctOptionId: number | null;
};

export type QuizResult = {
  attemptId: number;
  score: number;
  passed: boolean;
  grade: string;
  totalCorrect: number;
  totalQuestions: number;
  questionResults: QuestionResult[];
};
