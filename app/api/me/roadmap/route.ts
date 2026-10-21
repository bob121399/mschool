import { z } from "zod";
import { route, searchParams } from "@/lib/api";
import { employeeContext } from "@/lib/auth/context";
import { databaseError, json } from "@/lib/http";

export const dynamic = "force-dynamic";

// Manifest only: titles, IDs, order, status, score. Never lesson content of locked lessons (2.3).
export const GET = route(async (request) => {
  const assignmentId = z.uuid().parse(searchParams(request).get("assignmentId"));
  const { db } = await employeeContext();
  const { data, error } = await db.rpc("roadmap_manifest", { p_assignment: assignmentId });
  if (error) databaseError(error);
  return json({ items: data });
}, { mutation: false });
