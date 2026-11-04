import { describe, expect, it } from "vitest";

import {
  databaseMatchesEnvironment,
  isDevEnvironmentHost,
  isSideEffectEnabled,
  stripDevLabel,
  withDevLabel,
} from "@/lib/environment";

const DEV = "https://dev.portal.basket-app.com";
const PRODUCTION = "https://portal.basket-app.com";

describe("isDevEnvironmentHost", () => {
  it("recognizes an app in the Entorno de desarrollo", () => {
    expect(isDevEnvironmentHost("dev.portal.basket-app.com")).toBe(true);
    expect(isDevEnvironmentHost("dev.cashflow.basket-app.com:443")).toBe(true);
  });

  it("leaves production and local hosts alone", () => {
    expect(isDevEnvironmentHost("portal.basket-app.com")).toBe(false);
    expect(isDevEnvironmentHost("basket-app.com")).toBe(false);
    expect(isDevEnvironmentHost("devices.basket-app.com")).toBe(false);
    expect(isDevEnvironmentHost("localhost:3000")).toBe(false);
  });
});

describe("the dev label", () => {
  it("comes off a dev host and nothing else", () => {
    expect(stripDevLabel("dev.portal.basket-app.com")).toBe("portal.basket-app.com");
    expect(stripDevLabel("portal.basket-app.com")).toBe("portal.basket-app.com");
  });

  it("goes on an origin keeping its protocol and port", () => {
    expect(withDevLabel("https://cashflow.basket-app.com")).toBe(
      "https://dev.cashflow.basket-app.com",
    );
    expect(withDevLabel("http://portal.basket-app.localhost:3000")).toBe(
      "http://dev.portal.basket-app.localhost:3000",
    );
  });
});

describe("databaseMatchesEnvironment", () => {
  const db = (name: string) => `postgres://u:p@127.0.0.1:5434/${name}`;

  it("wants _dev databases in the Entorno de desarrollo", () => {
    expect(databaseMatchesEnvironment({ baseUrl: DEV, databaseUrl: db("basket_portal_dev") })).toBe(true);
    expect(databaseMatchesEnvironment({ baseUrl: DEV, databaseUrl: db("basket_portal") })).toBe(false);
  });

  it("refuses _dev databases outside it", () => {
    expect(databaseMatchesEnvironment({ baseUrl: PRODUCTION, databaseUrl: db("basket_portal") })).toBe(true);
    expect(databaseMatchesEnvironment({ baseUrl: PRODUCTION, databaseUrl: db("basket_auth_dev") })).toBe(false);
    expect(
      databaseMatchesEnvironment({ baseUrl: "http://localhost:3000", databaseUrl: db("basket_portal") }),
    ).toBe(true);
  });
});

describe("isSideEffectEnabled", () => {
  it("defaults to on in production and off in the Entorno de desarrollo", () => {
    expect(isSideEffectEnabled(undefined, { devEnvironment: false })).toBe(true);
    expect(isSideEffectEnabled("false", { devEnvironment: false })).toBe(false);
    expect(isSideEffectEnabled(undefined, { devEnvironment: true })).toBe(false);
    expect(isSideEffectEnabled("1", { devEnvironment: true })).toBe(false);
    expect(isSideEffectEnabled("true", { devEnvironment: true })).toBe(true);
  });
});
