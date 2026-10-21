import { z } from "zod";
import { route } from "@/lib/api";
import { hrContext } from "@/lib/auth/context";
import { json, readJson } from "@/lib/http";
import { inviteEmployee } from "@/lib/hr/invitations";

export const dynamic = "force-dynamic";
const body = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  grade: z.enum(["junior", "middle", "senior", "head"]),
  departmentId: z.uuid().nullable().optional(),
}).strict();

export const POST = route(async (request) => {
  const input = body.parse(await readJson(request, 4096));
  const { db, tenantId } = await hrContext();
  const result = await inviteEmployee(db, { email: input.email, grade: input.grade, departmentId: input.departmentId ?? null, tenantId });
  return json(result, 201);
}, { mutation: true });
