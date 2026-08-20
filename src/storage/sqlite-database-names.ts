export const SQLITE_DATABASE_NAMES = Object.freeze({
  search: "inkstone-search-v1.db",
  state: "inkstone-state-v1.db",
  // Keep the legacy file for AI data so existing provider profiles and conversations survive.
  ai: "inkstone-index.db",
});
