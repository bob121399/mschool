import "server-only";
import type { UserDb } from "@/lib/supabase/server";
import { databaseError } from "@/lib/http";
import type { ModuleInput } from "@/lib/courses/schema";

/** Loads a course (HR scope via RLS) into the editor payload shape. */
export async function loadCourseForEditor(db: UserDb, courseId: string) {
  const course = await db.from("courses").select("id,title,description,target_grade,version,status,revision,supersedes_id,objectives,coverage_gaps,updated_at,source_job_id")
    .eq("id", courseId).maybeSingle();
  if (course.error) databaseError(course.error);
  if (!course.data) return null;
  const [modules, lessons] = await Promise.all([
    db.from("course_modules").select("id,title,content,order_index").eq("course_id", courseId).order("order_index"),
    db.from("lessons").select("id,module_id,title,content,assessment_question,requires_assessment,learning_outcome,order_index")
      .eq("course_id", courseId).order("order_index"),
  ]);
  if (modules.error) databaseError(modules.error);
  if (lessons.error) databaseError(lessons.error);
  const lessonIds = (lessons.data ?? []).map((l) => l.id);
  const [rubrics, quiz, sources] = await Promise.all([
    db.from("assessment_rubrics").select("lesson_id,criteria,passing_score").in("lesson_id", lessonIds),
    db.from("quiz_items").select("lesson_id,question,options,correct_option_id,explanation,order_index").in("lesson_id", lessonIds).order("order_index"),
    db.from("lesson_sources").select("lesson_id,chunk_id").in("lesson_id", lessonIds),
  ]);
  for (const r of [rubrics, quiz, sources]) if (r.error) databaseError(r.error);
  const payloadModules: ModuleInput[] = (modules.data ?? []).map((m) => ({
    title: m.title,
    description: String((m.content as { description?: string } | null)?.description ?? ""),
    lessons: (lessons.data ?? []).filter((l) => l.module_id === m.id).map((l) => {
      const rubric = (rubrics.data ?? []).find((r) => r.lesson_id === l.id);
      return {
        title: l.title, learning_outcome: l.learning_outcome, content: l.content, requires_assessment: l.requires_assessment,
        assessment_question: l.assessment_question,
        source_chunk_ids: (sources.data ?? []).filter((s) => s.lesson_id === l.id).map((s) => s.chunk_id),
        rubric: rubric ? { criteria: rubric.criteria as ModuleInput["lessons"][number]["rubric"] extends infer R
          ? R extends { criteria: infer C } ? C : never : never, passing_score: rubric.passing_score } : null,
        quiz: (quiz.data ?? []).filter((q) => q.lesson_id === l.id).map((q) => ({ question: q.question,
          options: q.options as { id: string; label: string }[], correct_option_id: q.correct_option_id, explanation: q.explanation })),
      };
    }),
  }));
  return { course: course.data, modules: payloadModules, lessonIds: (lessons.data ?? []).map((l) => ({ id: l.id, module_id: l.module_id })) };
}
