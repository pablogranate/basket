import { describe, expect, it } from "vitest";

import type { AppRole } from "@/lib/database.types";
import {
  ADMIN_DEFAULT_DASHBOARD_HREF,
  COLLABORATOR_DEFAULT_DASHBOARD_HREF,
  getDefaultDashboardHrefForRole,
  hasFullDashboardAccessRole,
  isCollaboratorLimitedRole,
  isDashboardNavHrefAllowedForRole,
  isDashboardPathAllowedForRole,
} from "@/lib/constants";

const PRODUCTOR_CONTENT_PATHS = [
  "/grid",
  "/people",
  "/incidents",
  "/reports",
  "/teams",
] as const;

const PRODUCTOR_DENIED_PATHS = ["/roles", "/settings"] as const;

const EXTERNO_DENIED_PATHS = [
  "/teams",
  "/grid",
  "/people",
  "/incidents",
  "/reports",
  "/roles",
  "/settings",
] as const;

describe("three-tier dashboard access policy", () => {
  describe("Admin tier", () => {
    it("reaches every dashboard path", () => {
      const paths = [
        ...PRODUCTOR_CONTENT_PATHS,
        ...PRODUCTOR_DENIED_PATHS,
        "/mi-jornada",
        "/mi-jornada/match-1/reportar",
      ];

      for (const path of paths) {
        expect(isDashboardPathAllowedForRole(path, "admin")).toBe(true);
      }
    });

    it("is treated as a full-access, non-limited role", () => {
      expect(hasFullDashboardAccessRole("admin")).toBe(true);
      expect(isCollaboratorLimitedRole("admin")).toBe(false);
    });

    it("defaults to the admin dashboard href", () => {
      expect(getDefaultDashboardHrefForRole("admin")).toBe(
        ADMIN_DEFAULT_DASHBOARD_HREF,
      );
    });
  });

  describe.each<AppRole>(["editor", "coordinator"])(
    "Productor tier (%s)",
    (role) => {
      it("reaches the full content shell", () => {
        for (const path of PRODUCTOR_CONTENT_PATHS) {
          expect(isDashboardPathAllowedForRole(path, role)).toBe(true);
          expect(isDashboardPathAllowedForRole(`${path}/nested`, role)).toBe(
            true,
          );
        }
      });

      it("is denied /roles and /settings on direct access", () => {
        for (const path of PRODUCTOR_DENIED_PATHS) {
          expect(isDashboardPathAllowedForRole(path, role)).toBe(false);
          expect(isDashboardPathAllowedForRole(`${path}/anything`, role)).toBe(
            false,
          );
        }
      });

      it("hides /roles and /settings from navigation", () => {
        for (const path of PRODUCTOR_DENIED_PATHS) {
          expect(isDashboardNavHrefAllowedForRole(path, role)).toBe(false);
        }
        expect(isDashboardNavHrefAllowedForRole("/grid", role)).toBe(true);
        expect(isDashboardNavHrefAllowedForRole("/teams", role)).toBe(true);
      });

      it("counts as a full-access, non-limited role", () => {
        expect(hasFullDashboardAccessRole(role)).toBe(true);
        expect(isCollaboratorLimitedRole(role)).toBe(false);
      });

      it("defaults to the admin dashboard href", () => {
        expect(getDefaultDashboardHrefForRole(role)).toBe(
          ADMIN_DEFAULT_DASHBOARD_HREF,
        );
      });
    },
  );

  describe.each<AppRole>(["collaborator", "viewer"])(
    "Externo tier (%s)",
    (role) => {
      it("reaches /mi-jornada and its sub-paths", () => {
        expect(isDashboardPathAllowedForRole("/mi-jornada", role)).toBe(true);
        expect(
          isDashboardPathAllowedForRole(
            "/mi-jornada/match-1/reportar",
            role,
          ),
        ).toBe(true);
      });

      it("is denied /teams and every other section", () => {
        for (const path of EXTERNO_DENIED_PATHS) {
          expect(isDashboardPathAllowedForRole(path, role)).toBe(false);
          expect(isDashboardNavHrefAllowedForRole(path, role)).toBe(false);
        }
      });

      it("counts as a collaborator-limited role", () => {
        expect(hasFullDashboardAccessRole(role)).toBe(false);
        expect(isCollaboratorLimitedRole(role)).toBe(true);
      });

      it("defaults to the collaborator dashboard href", () => {
        expect(getDefaultDashboardHrefForRole(role)).toBe(
          COLLABORATOR_DEFAULT_DASHBOARD_HREF,
        );
      });
    },
  );
});
