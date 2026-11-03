import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GridPageShell } from "@/components/grid/grid-page-shell";
import { useStoredState } from "@/lib/use-stored-state";

const SUMMARY_COLLAPSED_STORAGE_KEY = "basket-production.grid.summary-collapsed.v1";

// A window with storage is what the client's first render sees. That render
// hydrates the server HTML, so it must not read storage (React error #418).
function withStoredItems(items: Record<string, string>) {
  vi.stubGlobal("window", {
    localStorage: { getItem: (key: string) => items[key] ?? null },
  });
}

function parseFlag(raw: string | null) {
  return raw === "true";
}

function Flag() {
  const [flag] = useStoredState("flag", parseFlag);
  return <span>{flag ? "on" : "off"}</span>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useStoredState", () => {
  it("renders the fallback on the first render even when storage has a value", () => {
    withStoredItems({ flag: "true" });

    expect(renderToStaticMarkup(<Flag />)).toBe("<span>off</span>");
  });
});

describe("GridPageShell", () => {
  it("renders the summary expanded on the first render even when the user collapsed it", () => {
    withStoredItems({ [SUMMARY_COLLAPSED_STORAGE_KEY]: "true" });

    const html = renderToStaticMarkup(
      <GridPageShell aside={<p>resumen</p>}>
        <p>grilla</p>
      </GridPageShell>,
    );

    expect(html).not.toContain("Mostrar resumen");
    expect(html).toContain("Compactar resumen");
  });
});
