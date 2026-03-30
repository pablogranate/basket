import { requireUserContext } from "@/lib/auth";

export async function requireAdminAccessManager() {
  const context = await requireUserContext();

  if (context.role !== "admin") {
    throw new Error("Solo un admin puede crear accesos a la plataforma.");
  }

  return context;
}
