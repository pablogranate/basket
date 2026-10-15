import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { grantRole } from "@/lib/acceso/accesos";
import {
  approvePortalAccessRequest,
  approvePortalAccessRequestMovingFicha,
  rejectInFavorOfExistingAccount,
} from "@/lib/access-requests/portal-approval";
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

// The applicant already has another login holding a ficha (findExistingAccount).
describe("a second login of a known person (integration)", () => {
  const sql = testSql();
  let applicantId: string;
  let oldLoginId: string;
  let deciderId: string;
  let actor: { profileId: string | null };
  let profileId: string;
  let personId: string;

  afterAll(async () => {
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
    applicantId = await seedAuthUser(sql, { email: "ana@basquetpass.tv" });
    oldLoginId = await seedAuthUser(sql, { email: "ana.personal@gmail.com" });
    deciderId = await seedAuthUser(sql, { email: "decider@basquetpass.tv" });
    actor = { profileId: (await seedActor(sql)).profileId };
    profileId = crypto.randomUUID();
    await sql`INSERT INTO profiles ${sql({ id: profileId, email: "ana.personal@gmail.com", full_name: "Ana Pérez", auth_user_id: oldLoginId })}`;
    [{ id: personId }] = await sql`INSERT INTO people ${sql({ full_name: "Ana Pérez", email: "ana.personal@gmail.com", phone: "+541100000000", profile_id: profileId })} RETURNING id`;
  });

  async function pendingRequest() {
    const { id } = await submitAccessRequest(authDb, {
      userId: applicantId,
      app: "portal",
      email: "ana@basquetpass.tv",
      fullName: "Ana Pérez",
      phone: "+5491100000000",
      funcion: "Relator",
      ciudad: "Argentina · Buenos Aires",
      mensaje: null,
    });
    return id;
  }

  function moving(requestId: string) {
    return {
      requestId,
      deciderId,
      actor,
      fullName: "Ana Pérez",
      phone: "+5491100000000",
      roleId: null,
      accessRole: "collaborator" as AppRole,
      existingPersonId: personId,
    };
  }

  it("keeping the new login moves the Cuenta and ficha to it and retires the old login", async () => {
    await grantRole({ userId: oldLoginId, app: "portal", role: "collaborator", grantedBy: deciderId });
    await grantRole({ userId: oldLoginId, app: "analytics", role: "read", grantedBy: deciderId });
    const id = await pendingRequest();

    const result = await approvePortalAccessRequestMovingFicha(moving(id));

    expect(result).toMatchObject({ profileId, personId, authUserId: applicantId, retiredAuthUserId: oldLoginId });
    const [profile] = await sql`SELECT email, auth_user_id FROM profiles WHERE id = ${profileId}`;
    expect(profile).toEqual({ email: "ana@basquetpass.tv", auth_user_id: applicantId });
    const [person] = await sql`SELECT email, profile_id FROM people WHERE id = ${personId}`;
    expect(person).toEqual({ email: "ana@basquetpass.tv", profile_id: profileId });
    expect(await sql`SELECT id FROM auth_user WHERE id = ${oldLoginId}`).toHaveLength(0);
    expect(await accessRow(sql, applicantId, "portal")).toEqual({ role: "collaborator", grantedBy: deciderId });
    expect(await accessRow(sql, applicantId, "analytics")).toMatchObject({ role: "read" });
    const [retired] = await sql`SELECT actor_id, detail FROM auth_audit_log WHERE action = 'identity.retired'`;
    expect(retired).toMatchObject({ actor_id: deciderId, detail: { retiredEmail: "ana.personal@gmail.com" } });
  });

  it("rolls everything back when another Cuenta already holds the applicant's email", async () => {
    await sql`INSERT INTO profiles ${sql({ id: crypto.randomUUID(), email: "ana@basquetpass.tv", full_name: "Otra" })}`;
    const id = await pendingRequest();

    await expect(approvePortalAccessRequestMovingFicha(moving(id))).rejects.toThrow(
      "Ya hay otra cuenta del portal con ese mail.",
    );

    const [request] = await sql`SELECT status FROM auth_access_request WHERE id = ${id}`;
    expect(request.status).toBe("pendiente");
    expect(await sql`SELECT id FROM auth_user WHERE id = ${oldLoginId}`).toHaveLength(1);
    const [profile] = await sql`SELECT auth_user_id FROM profiles WHERE id = ${profileId}`;
    expect(profile.auth_user_id).toBe(oldLoginId);
  });

  it("keeping the existing login rejects the request and gives that login the portal back", async () => {
    const id = await pendingRequest();

    const result = await rejectInFavorOfExistingAccount({
      requestId: id,
      deciderId,
      existingPersonId: personId,
      accessRole: "collaborator",
    });

    expect(result).toEqual({
      applicantEmail: "ana@basquetpass.tv",
      existingEmail: "ana.personal@gmail.com",
      regranted: true,
    });
    const [request] = await sql`SELECT status FROM auth_access_request WHERE id = ${id}`;
    expect(request.status).toBe("rechazada");
    expect(await accessRow(sql, oldLoginId, "portal")).toEqual({ role: "collaborator", grantedBy: deciderId });
    expect(await sql`SELECT id FROM auth_user WHERE id = ${applicantId}`).toHaveLength(1);
  });
});
