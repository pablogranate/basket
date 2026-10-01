import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { approvePortalAccessRequest } from "@/lib/access-requests/portal-approval";
import { submitAccessRequest } from "@/lib/access-requests/requests";
import type { AppRole } from "@/lib/database.types";
import { authDb } from "@/lib/db/auth-client";
import { accessRow, seedActor, seedAuthUser, testSql, truncateAll } from "@/test/integration/db";

// A portal approval spans two databases (ADR 0011): the claim and the Acceso
// in the Auth DB, the Cuenta and ficha in the Domain DB. Either side failing
// must leave the request pending with nothing written on the other side.
describe("portal approval across the two databases (integration)", () => {
  const sql = testSql();
  let applicantId: string;
  let deciderId: string;
  let actor: { profileId: string | null };

  afterAll(async () => {
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
    applicantId = await seedAuthUser(sql, { email: "ana@example.com" });
    deciderId = await seedAuthUser(sql, { email: "decider@basquetpass.tv" });
    actor = { profileId: (await seedActor(sql)).profileId };
  });

  async function pendingRequest() {
    const { id } = await submitAccessRequest(authDb, {
      userId: applicantId,
      app: "portal",
      email: "ana@example.com",
      fullName: "Ana Pérez",
      phone: "+5491100000000",
      funcion: "Relator",
      ciudad: "Argentina · Buenos Aires",
      mensaje: null,
    });
    return id;
  }

  function approval(requestId: string, overrides: { personId?: string; accessRole?: AppRole } = {}) {
    return {
      requestId,
      deciderId,
      actor,
      fullName: "Ana Pérez",
      phone: "+5491100000000",
      roleId: null,
      personId: null,
      mergePersonId: null,
      accessRole: "collaborator" as AppRole,
      ...overrides,
    };
  }

  async function domainRowsFor(email: string) {
    const [counts] = await sql<{ profiles: number; people: number }[]>`
      SELECT
        (SELECT count(*)::int FROM profiles WHERE lower(email) = ${email}) AS profiles,
        (SELECT count(*)::int FROM people WHERE lower(email) = ${email}) AS people`;
    return counts;
  }

  async function requestRow(id: string) {
    const [row] = await sql`
      SELECT status, decided_by, granted_role, person_id FROM auth_access_request WHERE id = ${id}`;
    return row;
  }

  it("approves: claim, portal Acceso, Cuenta and ficha, all written", async () => {
    const id = await pendingRequest();

    const result = await approvePortalAccessRequest(approval(id));

    expect(result).toMatchObject({ email: "ana@example.com", authUserId: applicantId });
    expect(await requestRow(id)).toEqual({
      status: "aprobada",
      decided_by: deciderId,
      granted_role: "collaborator",
      person_id: result.personId,
    });
    expect(await accessRow(sql, applicantId, "portal")).toEqual({
      role: "collaborator",
      grantedBy: deciderId,
    });
    expect(await domainRowsFor("ana@example.com")).toEqual({ profiles: 1, people: 1 });
  });

  it("rolls the claim back when the Domain write fails", async () => {
    const id = await pendingRequest();

    await expect(
      approvePortalAccessRequest(approval(id, { personId: crypto.randomUUID() })),
    ).rejects.toThrow("No pudimos crear la ficha de la persona.");

    expect(await requestRow(id)).toMatchObject({ status: "pendiente", decided_by: null });
    expect(await accessRow(sql, applicantId, "portal")).toBeNull();
    expect(await domainRowsFor("ana@example.com")).toEqual({ profiles: 0, people: 0 });
  });

  it("rolls the Domain write back when the Auth write fails", async () => {
    const id = await pendingRequest();

    // A role the portal catalog doesn't declare: the Acceso's composite FK fails.
    await expect(
      approvePortalAccessRequest(approval(id, { accessRole: "bogus" as AppRole })),
    ).rejects.toThrow();

    expect(await requestRow(id)).toMatchObject({ status: "pendiente", decided_by: null });
    expect(await accessRow(sql, applicantId, "portal")).toBeNull();
    expect(await domainRowsFor("ana@example.com")).toEqual({ profiles: 0, people: 0 });
  });

  it("refuses a request that belongs to another app", async () => {
    const { id } = await submitAccessRequest(authDb, {
      userId: applicantId,
      app: "facturacion",
      email: "ana@example.com",
      fullName: "Ana Pérez",
      phone: "+5491100000000",
      funcion: null,
      ciudad: "Argentina · Buenos Aires",
      mensaje: null,
    });

    await expect(approvePortalAccessRequest(approval(id))).rejects.toThrow(
      "Esta solicitud ya fue resuelta.",
    );
    expect(await domainRowsFor("ana@example.com")).toEqual({ profiles: 0, people: 0 });
  });
});
