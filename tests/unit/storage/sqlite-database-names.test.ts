import { describe, expect, test } from "vitest";

import { SQLITE_DATABASE_NAMES } from "../../../src/storage/sqlite-database-names";

describe("SQLite database isolation", () => {
  test("uses a distinct native database connection for each independently managed store", () => {
    expect(new Set(Object.values(SQLITE_DATABASE_NAMES)).size).toBe(3);
  });

  test("keeps AI data in the legacy database while moving derived and state stores", () => {
    expect(SQLITE_DATABASE_NAMES).toEqual({
      search: "inkstone-search-v1.db",
      state: "inkstone-state-v1.db",
      ai: "inkstone-index.db",
    });
  });
});
