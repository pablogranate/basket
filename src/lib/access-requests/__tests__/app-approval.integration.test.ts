import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  approveAppAccessRequest,
  rejectAppAccessRequest,
} from "@/lib/access-requests/app-approval";
import {
  approvePortalAccessRequest,
  rejectPortalAccessRequest,
} from "@/lib/access-requests/portal-approval";
import { submitAccessRequest } from "@/lib/access-requests/requests";
import type { AppRole } from "@/lib/database.types";
import { authDb } from "@/lib/db/auth-client";
import { accessRow, seedActor, seedAuthUser, testSql, truncateAll } from "@/test/integration/db";

// Sibling Solicitudes decided from the apex (basket#200): the claim, the one
// Acceso and the audit row commit together in the Auth DB; nothing is written
// to the Domain DB.
describe("sibling approval from the apex (integration)", () => {
  const sql = testSql();
  let applicantId: string;
  let deciderId: string;

  afterAll(async () => {
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
    applicantId = await seedAuthUser(sql, { email: "ana@example.com" });
    deciderId = await seedAuthUser(sql, { email: "super@basquetpass.tv" });
  });

  async function pendingRequest(app: string) {
    const { id } = await submitAccessRequest(authDb, {
      userId: applicantId,
      app,
      email: "ana@example.com",
      fullName: "Ana Pérez",
      phone: "+5491100000000",
      funcion: app === "portal" ? "Relator" : null,
      ciudad: "Argentina · Buenos Aires",
      mensaje: null,
    });
    return id;
  }

  async function requestRow(id: string) {
    const [row] = await sql`
      SELECT status, decided_by, granted_role, person_id FROM auth_access_request WHERE id = ${id}`;
    return row;
  }

  async function accesosOf(userId: string) {
    return sql<{ app: string; role: string }[]>`
      SELECT app, role FROM auth_app_access WHERE user_id = ${userId} ORDER BY app`;
  }

  async function auditRows() {
    return sql<{ actor_id: string | null; target_user_id: string | null; action: string; detail: Record<string, unknown> }[]>`
      SELECT actor_id, target_user_id, action, detail FROM auth_audit_log ORDER BY id`;
  }

  async function domainRowsFor(email: string) {
    const [counts] = await sql<{ profiles: number; people: number }[]>`
      SELECT
        (SELECT count(*)::int FROM profiles WHERE lower(email) = ${email}) AS profiles,
        (SELECT count(*)::int FROM people WHERE lower(email) = ${email}) AS people`;
    return counts;
  }

  it("grants exactly the requested app's role, with no Cuenta or ficha", async () => {
    const id = await pendingRequest("facturacion");

    const result = await approveAppAccessRequest({
      requestId: id,
      app: "facturacion",
      role: "coordinador",
      deciderId,
    });

    expect(result).toMatchObject({ email: "ana@example.com", userId: applicantId });
    expect(await accesosOf(applicantId)).toEqual([{ app: "facturacion", role: "coordinador" }]);
    expect(await accessRow(sql, applicantId, "facturacion")).toEqual({
      role: "coordinador",
      grantedBy: deciderId,
    });
    expect(await requestRow(id)).toEqual({
      status: "aprobada",
      decided_by: deciderId,
      granted_role: "coordinador",
      person_id: null,
    });
    expect(await domainRowsFor("ana@example.com")).toEqual({ profiles: 0, people: 0 });
    expect(await auditRows()).toEqual([
      {
        actor_id: deciderId,
        target_user_id: applicantId,
        action: "access-request.aprobada",
        detail: { requestId: id, app: "facturacion", email: "ana@example.com", grantedRole: "coordinador" },
      },
    ]);
  });

  it("refuses a role outside the app's catalog and leaves the request pending", async () => {
    const id = await pendingRequest("facturacion");

    await expect(
      approveAppAccessRequest({ requestId: id, app: "facturacion", role: "write", deciderId }),
    ).rejects.toThrow("Ese rol no existe en la app pedida.");

    expect(await requestRow(id)).toMatchObject({ status: "pendiente", decided_by: null });
    expect(await accesosOf(applicantId)).toEqual([]);
    expect(await auditRows()).toEqual([]);
  });

  it("claims only within the app it names", async () => {
    const id = await pendingRequest("facturacion");

    await expect(
      approveAppAccessRequest({ requestId: id, app: "incidencias", role: "read", deciderId }),
    ).rejects.toThrow("Esta solicitud ya fue resuelta.");
    expect(await accesosOf(applicantId)).toEqual([]);
  });

  it("refuses portal requests: those go through the portal form", async () => {
    const id = await pendingRequest("portal");

    await expect(
      approveAppAccessRequest({ requestId: id, app: "portal", role: "collaborator", deciderId }),
    ).rejects.toThrow("Las solicitudes del portal se aprueban con su formulario.");
    expect(await requestRow(id)).toMatchObject({ status: "pendiente" });
  });

  it("rejects silently: no Acceso, one audit row", async () => {
    const id = await pendingRequest("incidencias");

    await rejectAppAccessRequest({ requestId: id, app: "incidencias", deciderId });

    expect(await requestRow(id)).toMatchObject({ status: "rechazada", decided_by: deciderId });
    expect(await accesosOf(applicantId)).toEqual([]);
    expect((await auditRows()).map((row) => row.action)).toEqual(["access-request.rechazada"]);
  });

  it("a second decider loses the claim: approve races reject, one wins", async () => {
    const id = await pendingRequest("facturacion");

    const results = await Promise.allSettled([
      approveAppAccessRequest({ requestId: id, app: "facturacion", role: "admin", deciderId }),
      rejectAppAccessRequest({ requestId: id, app: "facturacion", deciderId }),
    ]);

    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toBe(
      "Esta solicitud ya fue resuelta.",
    );
    expect(await auditRows()).toHaveLength(1);

    const status = (await requestRow(id)).status;
    expect(await accesosOf(applicantId)).toEqual(
      status === "aprobada" ? [{ app: "facturacion", role: "admin" }] : [],
    );
  });

  it("a later decider is told the request is already resolved", async () => {
    const id = await pendingRequest("facturacion");
    await approveAppAccessRequest({ requestId: id, app: "facturacion", role: "periodista", deciderId });

    await expect(
      rejectAppAccessRequest({ requestId: id, app: "facturacion", deciderId }),
    ).rejects.toThrow("Esta solicitud ya fue resuelta.");
    expect(await accesosOf(applicantId)).toEqual([{ app: "facturacion", role: "periodista" }]);
  });

  it("portal decisions are audited in the Auth DB too", async () => {
    const actor = { profileId: (await seedActor(sql)).profileId };
    const approved = await pendingRequest("portal");

    await approvePortalAccessRequest({
      requestId: approved,
      deciderId,
      actor,
      fullName: "Ana Pérez",
      phone: "+5491100000000",
      roleId: null,
      personId: null,
      mergePersonId: null,
      accessRole: "collaborator" as AppRole,
    });

    const other = await seedAuthUser(sql, { email: "beto@example.com" });
    const { id: rejected } = await submitAccessRequest(authDb, {
      userId: other,
      app: "portal",
      email: "beto@example.com",
      fullName: "Beto Díaz",
      phone: "+5491100000001",
      funcion: "Relator",
      ciudad: "Argentina · Buenos Aires",
      mensaje: null,
    });
    await rejectPortalAccessRequest({ requestId: rejected, deciderId });

    expect(
      (await auditRows()).map(({ action, target_user_id, detail }) => ({
        action,
        target_user_id,
        app: detail.app,
      })),
    ).toEqual([
      { action: "access-request.aprobada", target_user_id: applicantId, app: "portal" },
      { action: "access-request.rechazada", target_user_id: other, app: "portal" },
    ]);
  });
});
