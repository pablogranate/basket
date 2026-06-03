// Vitest runs in a node environment where the `server-only` package's
// react-server export condition is not available. This empty stub stands in
// for it so server-only modules (e.g. src/lib/data/platform-access.ts) can be
// imported and unit-tested directly. See vitest.config.mts resolve.alias.
export {};
