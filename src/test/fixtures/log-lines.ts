import { vi } from "vitest";

// The JSON lines a wide event writes to stdout while a test runs.
export function captureLogLines() {
  const lines: Array<Record<string, unknown>> = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      lines.push(JSON.parse(String(chunk)));
      return true;
    });

  return { lines, restore: () => spy.mockRestore() };
}
