import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { grantAcceso } from "@/lib/acceso/accesos";
import { getAccesosMatrix } from "@/lib/acceso/matrix";
import { seedAuthUser, testSql, truncateAll } from "@/test/integration/db";

// What the Accesos page shows: every identity in the Auth DB, joined to its
// Cuenta (Domain DB profiles) and Ficha (people) when they exist.
describe("accesos matrix (integration)", () => {
  const sql = testSql();

  beforeAll(async () => {
    await sql`SELECT 1`;
  });

  afterAll(async () => {
    await sql.end();
  });

  beforeEach(async () => {
    await truncateAll(sql);
  });

  it("joins identity, Cuenta role and Ficha name; identities without either still appear", async () => {
    const admin = await seedAuthUser(sql, { email: "admin@basquetpass.tv", name: "Admin" });
    const operator = await seedAuthUser(sql, { email: "op@basquetpass.tv", name: "Operador" });
    const viewer = await seedAuthUser(sql, { email: "viewer@gmail.com", name: "Viewer" });

    const adminProfile = crypto.randomUUID();
    await sql`INSERT INTO profiles ${sql({ id: adminProfile, email: "admin@basquetpass.tv", role: "admin", full_name: "Admin", auth_user_id: admin })}`;
    await sql`INSERT INTO people ${sql({ full_name: "Ana Admin", email: "admin@basquetpass.tv", profile_id: adminProfile, active: true })}`;
    // Cuenta without Ficha.
    await sql`INSERT INTO profiles ${sql({ id: crypto.randomUUID(), email: "op@basquetpass.tv", role: "collaborator", full_name: "Operador", auth_user_id: operator })}`;
    await grantAcceso({ userId: operator, app: "incidencias", level: "write", grantedBy: admin });

    const matrix = await getAccesosMatrix();

    expect(matrix.map((r) => r.email)).toEqual([
      "admin@basquetpass.tv",
      "op@basquetpass.tv",
      "viewer@gmail.com",
    ]);
    expect(matrix[0]).toMatchObject({
      userId: admin,
      cuentaRole: "admin",
      fichaName: "Ana Admin",
      accesos: {},
    });
    expect(matrix[1]).toMatchObject({ cuentaRole: "collaborator", fichaName: null });
    expect(matrix[1].accesos.incidencias).toMatchObject({ level: "write", grantedBy: admin });
    expect(matrix[2]).toMatchObject({ cuentaRole: null, fichaName: null, accesos: {} });
    expect(viewer).toBe(matrix[2].userId);
  });
});
