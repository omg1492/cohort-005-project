import type { Route } from "./+types/courses.$slug.lessons.$lessonId";

import {
  coursePermissions,
  type Capability,
  type CourseRef,
  type DenialReason,
} from "~/modules/permissions/course-permissions.server";
import { renderComment } from "~/lib/comment-markdown.server";
import { markdown, type Markdown } from "~/lib/text";
import {
  createComment,
  deleteComment,
  editComment,
} from "~/lib/comments.server";
import { defaultNotifications } from "~/lib/notifications.server";
import { isBookmarked, toggleBookmark } from "~/lib/bookmarks.server";
import { getNote, saveNote } from "~/lib/notes.server";
import { noteBodySchema } from "~/modules/lesson-notes";
import { type RenderedComment } from "~/components/comment-thread";
import { db } from "~/db";
import {
  completeLesson,
  visitLesson,
} from "~/modules/lesson-progress/index.server";
import {
  getLessonQuiz,
  isQuizOnLesson,
  submitQuizAttempt,
} from "~/modules/lesson-quiz/index.server";
import {
  categories,
  comments,
  courses,
  lessons,
  modules,
  users,
  UserRole,
} from "~/db/schema";
import { asc, eq, or } from "drizzle-orm";
import { renderMarkdown } from "~/lib/markdown.server";
import { LockedLesson } from "~/components/lesson-viewer/locked-lesson";
import { FullLesson } from "~/components/lesson-viewer/full-lesson";
import { data } from "react-router";
import { z } from "zod";
import { parseFormData, parseParams } from "~/lib/validation";

const createCommentSchema = z.object({
  intent: z.literal("create-comment"),
  body: z.string(),
  parentId: z.coerce.number().int().optional(),
});

const editCommentSchema = z.object({
  intent: z.literal("edit-comment"),
  commentId: z.coerce.number().int(),
  body: z.string(),
});

const saveNoteSchema = z.object({ body: noteBodySchema });

const lessonParamsSchema = z.object({
  lessonId: z.coerce.number().int().positive(),
});

const submitQuizSchema = z.object({
  quizId: z.coerce.number().int().positive(),
});

const QUIZ_ANSWER_PREFIX = "question-";

// A quiz answer arrives as a field named for its question, whose value is
// the chosen option: `question-<questionId>=<optionId>`.
const quizAnswerSchema = z.tuple([
  z.coerce.number().int().positive(),
  z.coerce.number().int().positive(),
]);

function parseQuizAnswers(formData: FormData): Record<number, number> {
  const selectedAnswers: Record<number, number> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(QUIZ_ANSWER_PREFIX)) continue;
    const parsed = quizAnswerSchema.safeParse([
      key.slice(QUIZ_ANSWER_PREFIX.length),
      value,
    ]);
    if (!parsed.success) throw data("Invalid quiz answer", { status: 400 });
    const [questionId, optionId] = parsed.data;
    selectedAnswers[questionId] = optionId;
  }
  return selectedAnswers;
}

const deleteCommentSchema = z.object({
  intent: z.literal("delete-comment"),
  commentId: z.coerce.number().int(),
});

type CommentAuthor = {
  id: number;
  name: string;
  avatarUrl: string | null;
  isInstructor: boolean;
  isPlatformAdmin: boolean;
};

type ThreadComment = {
  id: number;
  body: Markdown;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  author: CommentAuthor;
  replies: ThreadComment[];
};

function getCourseWithDetails(id: number) {
  const course = db
    .select({
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      description: courses.description,
      salesCopy: courses.salesCopy,
      instructorId: courses.instructorId,
      categoryId: courses.categoryId,
      status: courses.status,
      coverImageUrl: courses.coverImageUrl,
      price: courses.price,
      pppEnabled: courses.pppEnabled,
      createdAt: courses.createdAt,
      updatedAt: courses.updatedAt,
      instructorName: users.name,
      instructorAvatarUrl: users.avatarUrl,
      instructorBio: users.bio,
      categoryName: categories.name,
    })
    .from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .innerJoin(categories, eq(courses.categoryId, categories.id))
    .where(eq(courses.id, id))
    .get();

  if (!course) return null;

  const courseModules = db
    .select()
    .from(modules)
    .where(eq(modules.courseId, id))
    .orderBy(modules.position)
    .all();

  const moduleIds = courseModules.map((m) => m.id);

  const courseLessons =
    moduleIds.length > 0
      ? db
          .select()
          .from(lessons)
          .where(or(...moduleIds.map((mid) => eq(lessons.moduleId, mid))))
          .orderBy(lessons.position)
          .all()
      : [];

  return {
    ...course,
    modules: courseModules.map((mod) => ({
      ...mod,
      lessons: courseLessons.filter((l) => l.moduleId === mod.id),
    })),
  };
}

function getLessonById(id: number) {
  return db.select().from(lessons).where(eq(lessons.id, id)).get();
}

function getModuleById(id: number) {
  return db.select().from(modules).where(eq(modules.id, id)).get();
}

/**
 * The course named by this route's slug, through this lesson. A lesson in
 * another course, or a malformed lesson id, counts as not found.
 */
function lessonRef(params: { slug: string; lessonId: string }): CourseRef {
  return { slug: params.slug, lessonId: params.lessonId };
}

/**
 * What each action intent needs: comments, Bookmarks and Notes need view;
 * progress and quizzes need take. Moderating Discussions (deleting someone
 * else's post) additionally needs manage, checked in the delete intent.
 */
const INTENT_CAPABILITY: Record<string, Capability | undefined> = {
  "create-comment": "view",
  "edit-comment": "view",
  "delete-comment": "view",
  "toggle-bookmark": "view",
  "save-note": "view",
  "mark-complete": "take",
  "submit-quiz": "take",
};

function getUserById(id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

function getCourseForLesson(lessonId: number) {
  return db
    .select({
      courseId: courses.id,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      instructorId: courses.instructorId,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .get();
}

function getCommentById(commentId: number) {
  return db.select().from(comments).where(eq(comments.id, commentId)).get();
}

function getLessonThread(lessonId: number): ThreadComment[] {
  const course = getCourseForLesson(lessonId);
  if (!course) return [];

  const rows = db
    .select({
      id: comments.id,
      body: comments.body,
      parentId: comments.parentId,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
      deletedAt: comments.deletedAt,
      authorId: users.id,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
      authorRole: users.role,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.lessonId, lessonId))
    .orderBy(asc(comments.createdAt), asc(comments.id))
    .all();

  const toThreadComment = (row: (typeof rows)[number]): ThreadComment => {
    const deleted = row.deletedAt !== null;
    return {
      id: row.id,
      body: deleted ? markdown("") : row.body,
      createdAt: row.createdAt,
      editedAt: deleted ? null : row.editedAt,
      deleted,
      author: {
        id: row.authorId,
        name: row.authorName,
        avatarUrl: row.authorAvatarUrl,
        isInstructor: row.authorId === course.instructorId,
        isPlatformAdmin: row.authorRole === UserRole.Admin,
      },
      replies: [],
    };
  };

  const topLevel: ThreadComment[] = [];
  const byId = new Map<number, ThreadComment>();

  for (const row of rows) {
    if (row.parentId !== null) continue;
    const comment = toThreadComment(row);
    byId.set(comment.id, comment);
    topLevel.push(comment);
  }

  for (const row of rows) {
    if (row.parentId === null || row.deletedAt !== null) continue;
    byId.get(row.parentId)?.replies.push(toThreadComment(row));
  }

  // A deleted question with no replies left has nothing worth showing.
  return topLevel.filter((c) => !c.deleted || c.replies.length > 0);
}

/**
 * Renders every comment body to sanitised HTML, preserving the reply nesting.
 * Comments are untrusted input, so this must be renderComment — never
 * renderMarkdown, which lets raw HTML through for trusted lesson content.
 */
async function renderThread(
  nodes: ThreadComment[]
): Promise<RenderedComment[]> {
  return Promise.all(
    nodes.map(async (node) => ({
      ...node,
      bodyHtml: node.deleted ? "" : await renderComment(node.body),
      replies: await renderThread(node.replies),
    }))
  );
}

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.lesson?.title ?? "Lesson";
  const courseTitle = loaderData?.course?.title ?? "Course";
  return [{ title: `${title} — ${courseTitle} — Cadence` }];
}

type FlatLesson = {
  id: number;
  title: string;
  moduleId: number;
  moduleTitle: string;
};

function flattenCourseLessons(course: {
  modules: Array<{
    id: number;
    title: string;
    lessons: Array<{ id: number; title: string; moduleId: number }>;
  }>;
}): FlatLesson[] {
  const flat: FlatLesson[] = [];
  for (const mod of course.modules) {
    for (const lesson of mod.lessons) {
      flat.push({
        id: lesson.id,
        title: lesson.title,
        moduleId: mod.id,
        moduleTitle: mod.title,
      });
    }
  }
  return flat;
}

export async function loader({ params, request }: Route.LoaderArgs) {
  // Not found covers an unknown course, a malformed lesson id, and a lesson
  // from another course.
  const decisions = await coursePermissions.getCourseDecisions(
    request,
    lessonRef(params)
  );
  if (!decisions.found) {
    throw data("Lesson not found", { status: 404 });
  }

  const { course, person, enrolled, view, take, manage } = decisions;
  const currentUserId = person?.id ?? null;
  const { lessonId } = parseParams(params, lessonParamsSchema);

  const courseWithDetails = getCourseWithDetails(course.id);
  const lesson = getLessonById(lessonId);
  const mod = lesson ? getModuleById(lesson.moduleId) : undefined;
  if (!courseWithDetails || !lesson || !mod) {
    throw data("Lesson not found", { status: 404 });
  }

  const curriculum = courseWithDetails.modules.map((m) => ({
    id: m.id,
    title: m.title,
    lessons: m.lessons.map((l) => ({
      id: l.id,
      title: l.title,
    })),
  }));

  // Someone who can't view the content gets the lesson's title, its module and
  // the course outline — never the body, video or quiz — plus the reason, so
  // the page can show the right call to action.
  if (!view.allowed) {
    const lockedReason: DenialReason = view.reason;

    return {
      view: "locked" as const,
      course: {
        id: courseWithDetails.id,
        title: courseWithDetails.title,
        slug: courseWithDetails.slug,
      },
      curriculum,
      module: { id: mod.id, title: mod.title },
      lesson: { id: lesson.id, title: lesson.title },
      enrolled,
      lockedReason,
    };
  }

  // Progress is recorded only for people who can take the course, so a
  // Student under a Country Lock gets none.
  const progress =
    currentUserId && take.allowed
      ? visitLesson(db, {
          studentId: currentUserId,
          lessonId,
          courseId: course.id,
          videoDurationSeconds: lesson.videoUrl
            ? (lesson.durationMinutes ?? 0) * 60
            : null,
        })
      : null;
  const lessonStatus = progress?.lessonStatus ?? null;
  const lastWatchPosition = progress?.lastWatchPosition ?? 0;
  const watchProgress = progress?.watchProgress ?? 0;
  const lessonProgressMap = progress?.lessonProgressMap ?? {};

  // Everything from here on is behind the can-view-content bar above:
  // comments, Bookmarks and Notes are confidential to the course.
  const instructor = getUserById(course.instructorId);
  const comments = await renderThread(getLessonThread(lessonId));

  const bookmarked = currentUserId
    ? isBookmarked(db, currentUserId, lessonId)
    : false;
  const note = currentUserId ? getNote(db, currentUserId, lessonId) : undefined;

  const contentHtml = lesson.content
    ? await renderMarkdown(lesson.content)
    : null;

  const allLessons = flattenCourseLessons(courseWithDetails);
  const currentIndex = allLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson =
    currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

  const { quiz, bestAttempt } = getLessonQuiz(db, lessonId, currentUserId);

  return {
    view: "full" as const,
    course: {
      id: courseWithDetails.id,
      title: courseWithDetails.title,
      slug: courseWithDetails.slug,
    },
    curriculum,
    module: {
      id: mod.id,
      title: mod.title,
    },
    lesson,
    contentHtml,
    lessonStatus,
    enrolled,
    currentUserId,
    prevLesson,
    nextLesson,
    quiz,
    bestAttempt,
    lastWatchPosition,
    watchProgress,
    lessonProgressMap,
    comments,
    canModerate: manage.allowed,
    instructorName: instructor?.name ?? "your instructor",
    bookmarked,
    note: note ? { body: note.body, updatedAt: note.updatedAt } : null,
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Every intent checks its own capability here — loader guards don't protect
  // actions. The ref includes the lesson, so a lesson from another course (or
  // a malformed id) is a 404.
  const capability =
    typeof intent === "string" ? INTENT_CAPABILITY[intent] : undefined;
  if (!capability) {
    throw data("Invalid action", { status: 400 });
  }
  const ref = lessonRef(params);
  const { person } = await coursePermissions.requireCapability(
    request,
    capability,
    ref
  );
  const currentUserId = person.id;
  const { lessonId } = parseParams(params, lessonParamsSchema);

  if (
    intent === "create-comment" ||
    intent === "edit-comment" ||
    intent === "delete-comment"
  ) {
    try {
      if (intent === "create-comment") {
        const parsed = parseFormData(formData, createCommentSchema);
        if (!parsed.success) {
          return { ok: false, error: "Enter a comment before posting." };
        }
        const created = await createComment(
          db,
          currentUserId,
          lessonId,
          parsed.data.parentId ?? null,
          parsed.data.body,
          new Date(),
          await defaultNotifications()
        );
        if (!created.ok) return created;
        return { ok: true };
      }

      if (intent === "edit-comment") {
        const parsed = parseFormData(formData, editCommentSchema);
        if (!parsed.success) {
          return { ok: false, error: "Enter a comment before saving." };
        }
        // Scope the id to this lesson so a comment elsewhere can't be reached
        // by posting its id to this route.
        const existing = getCommentById(parsed.data.commentId);
        if (!existing || existing.lessonId !== lessonId) {
          throw data("Comment not found", { status: 404 });
        }
        const edited = editComment(
          db,
          parsed.data.commentId,
          currentUserId,
          parsed.data.body,
          new Date()
        );
        if (!edited.ok) return edited;
        return { ok: true };
      }

      const parsed = parseFormData(formData, deleteCommentSchema);
      if (!parsed.success) {
        return { ok: false, error: "Could not delete that comment." };
      }
      const existing = getCommentById(parsed.data.commentId);
      if (!existing || existing.lessonId !== lessonId) {
        throw data("Comment not found", { status: 404 });
      }
      // Anyone who can view may delete their own posts; moderating someone
      // else's takes the manage capability.
      const decisions = coursePermissions.decide(person, ref);
      const canModerate = decisions.found && decisions.manage.allowed;
      const deleted = await deleteComment(
        db,
        parsed.data.commentId,
        currentUserId,
        canModerate,
        new Date(),
        await defaultNotifications()
      );
      if (!deleted.ok) return deleted;
      return { ok: true };
    } catch (error) {
      // Service validation failures are user-correctable; anything thrown as a
      // Response (404 above) should keep bubbling.
      if (error instanceof Error) {
        return { ok: false, error: error.message };
      }
      throw error;
    }
  }

  if (intent === "toggle-bookmark" || intent === "save-note") {
    if (intent === "toggle-bookmark") {
      const bookmarked = toggleBookmark(
        db,
        currentUserId,
        lessonId,
        new Date()
      );
      return { ok: true, bookmarked };
    }

    const parsed = parseFormData(formData, saveNoteSchema);
    if (!parsed.success) {
      return { ok: false, error: parsed.errors.body };
    }
    const saved = saveNote(
      db,
      currentUserId,
      lessonId,
      parsed.data.body,
      new Date()
    );
    if (!saved.ok) return saved;
    return { ok: true };
  }

  if (intent === "mark-complete") {
    completeLesson(db, { studentId: currentUserId, lessonId }, new Date());
    return { success: true };
  }

  if (intent === "submit-quiz") {
    const parsedQuiz = parseFormData(formData, submitQuizSchema);
    if (!parsedQuiz.success) {
      throw data("Invalid quiz ID", { status: 400 });
    }
    const { quizId } = parsedQuiz.data;
    // Scope the quiz to this lesson so a quiz elsewhere can't be reached by
    // posting its id to this route.
    if (!isQuizOnLesson(db, quizId, lessonId)) {
      throw data("Quiz not found", { status: 404 });
    }

    const result = submitQuizAttempt(db, {
      studentId: currentUserId,
      quizId,
      selectedAnswers: parseQuizAnswers(formData),
    });
    if (!result) {
      throw data("Failed to score quiz", { status: 500 });
    }

    return { quizResult: result };
  }

  throw data("Invalid action", { status: 400 });
}

export default function LessonViewer({ loaderData }: Route.ComponentProps) {
  if (loaderData.view === "locked") {
    return <LockedLesson data={loaderData} />;
  }
  return <FullLesson data={loaderData} />;
}

export { LessonErrorBoundary as ErrorBoundary } from "~/components/lesson-viewer/error-boundary";
