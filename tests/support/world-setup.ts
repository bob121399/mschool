import { randomUUID } from "node:crypto";
import {
  coursePayload, createApprovedSource, createAuthUser, createEmployee, createSuperadmin, enrollTotp, lessonsOfCourse,
  must, provisionTenant, publishCourse, publishTrack, serviceClient, signIn, type Db,
} from "../../scripts/lib/world";
import { totp } from "./totp";

export const CANARY_B = "CANARY_TENANT_B_9F24";

export type TenantWorld = {
  tenantId: string; hrId: string; hr: Db; hrEmail: string;
  courseId: string; trackId: string; lessons: { id: string; order_index: number; requires_assessment: boolean }[];
  documentId: string; chunkIds: string[];
  employees: { id: string; email: string; db: Db }[];
  assignments: string[];
};

export type World = { run: string; password: string; admin: Db; a: TenantWorld; b: TenantWorld;
  superadmin: { id: string; email: string; db: Db; secret: string } };

async function tenantWorld(admin: Db, run: string, password: string, label: "a" | "b", employees: number): Promise<TenantWorld> {
  const hrEmail = `hr-${label}-${run}@test.mschool.local`;
  const hrId = await createAuthUser(admin, hrEmail, password);
  const tenantId = await provisionTenant(admin, hrId, `Test ${label.toUpperCase()} ${run}`, { demo: true });
  const hr = await signIn(hrEmail, password);
  const pages = label === "b"
    ? [`Регламент B. Секретная строка ${CANARY_B} только для B.`, "Регламент B, страница 2."]
    : ["Регламент A: проверяйте документ клиента до операции.", "Регламент A: фиксируйте результат в журнале."];
  const source = await createApprovedSource(admin, hr, tenantId, `Регламент ${label.toUpperCase()}`, pages);
  const courseId = await publishCourse(hr, tenantId, coursePayload(`Курс ${label.toUpperCase()} ${run}`, "junior", source.chunkIds));
  const trackId = await publishTrack(hr, tenantId, `Трек ${label.toUpperCase()} ${run}`, "junior", [courseId]);
  const lessons = await lessonsOfCourse(admin, courseId);
  const emps: TenantWorld["employees"] = [];
  const assignments: string[] = [];
  for (let i = 1; i <= employees; i += 1) {
    const email = `emp-${label}${i}-${run}@test.mschool.local`;
    const id = await createEmployee(admin, tenantId, email, password, "junior");
    assignments.push(must(await hr.rpc("assign_track", { p_user: id, p_track: trackId }), "assign_track"));
    emps.push({ id, email, db: await signIn(email, password) });
  }
  return { tenantId, hrId, hr, hrEmail, courseId, trackId, lessons, documentId: source.documentId,
    chunkIds: source.chunkIds, employees: emps, assignments };
}

export async function buildWorld(opts: { employeesA?: number; employeesB?: number } = {}): Promise<World> {
  const run = randomUUID().slice(0, 8);
  const password = `T-${randomUUID()}`;
  const admin = serviceClient();
  const [a, b] = await Promise.all([
    tenantWorld(admin, run, password, "a", opts.employeesA ?? 2),
    tenantWorld(admin, run, password, "b", opts.employeesB ?? 1),
  ]);
  const saEmail = `sa-${run}@test.mschool.local`;
  const saId = await createSuperadmin(admin, saEmail, password);
  const saDb = await signIn(saEmail, password);
  const secret = await enrollTotp(saDb, (s) => totp(s));
  return { run, password, admin, a, b, superadmin: { id: saId, email: saEmail, db: saDb, secret } };
}
