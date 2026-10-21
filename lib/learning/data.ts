import "server-only";
import { z } from "zod";
import type { UserDb } from "@/lib/supabase/server";
import { databaseError } from "@/lib/http";

export const roadmapItem = z.object({
  course_id: z.string(), course_title: z.string(), module_id: z.string(), module_title: z.string(),
  lesson_id: z.string(), lesson_title: z.string(), order_index: z.number(), module_order_index: z.number(),
  course_order_index: z.number(), status: z.enum(["locked", "in_progress", "completed"]), score: z.number().nullable(),
});
export type RoadmapItem = z.infer<typeof roadmapItem>;

export async function loadRoadmap(db: UserDb, assignmentId: string): Promise<RoadmapItem[] | null> {
  const { data, error } = await db.rpc("roadmap_manifest", { p_assignment: assignmentId });
  if (error) {
    if (error.message === "NOT_FOUND") return null;
    databaseError(error);
  }
  return z.array(roadmapItem).parse(data);
}

export async function loadAssignments(db: UserDb, userId: string) {
  const { data, error } = await db.from("assignments")
    .select("id,status,assigned_at,due_at,completed_at,track_id,tracks(title,version,target_grade)")
    .eq("user_id", userId).neq("status", "cancelled").order("assigned_at", { ascending: false }).limit(20);
  if (error) databaseError(error);
  return (data ?? []).map((a) => ({ ...a, track: a.tracks as { title: string; version: number; target_grade: string } | null }));
}
