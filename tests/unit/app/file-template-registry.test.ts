import { describe, expect, it } from "vitest";

import {
  DEFAULT_FILE_TEMPLATE_REGISTRY,
  createFileTemplateRegistry,
} from "../../../src/app/file-template-registry";

describe("file template registry", () => {
  it("provides immutable first-release Markdown templates", () => {
    expect(DEFAULT_FILE_TEMPLATE_REGISTRY.templates.map((template) => template.id)).toEqual([
      "meeting-notes",
      "project-brief",
      "task-list",
    ]);
    expect(
      DEFAULT_FILE_TEMPLATE_REGISTRY.templates.every(
        (template) => template.defaultPath.endsWith(".md") && template.content.length > 0,
      ),
    ).toBe(true);
    expect(Object.isFrozen(DEFAULT_FILE_TEMPLATE_REGISTRY)).toBe(true);
    expect(Object.isFrozen(DEFAULT_FILE_TEMPLATE_REGISTRY.templates)).toBe(true);
    expect(Object.isFrozen(DEFAULT_FILE_TEMPLATE_REGISTRY.templates[0])).toBe(true);
  });

  it("resolves templates by stable ID", () => {
    expect(DEFAULT_FILE_TEMPLATE_REGISTRY.get("task-list")?.label).toBe("Task list");
    expect(DEFAULT_FILE_TEMPLATE_REGISTRY.get("missing")).toBeNull();
  });

  it("rejects duplicate IDs and invalid default paths", () => {
    const template = {
      id: "note",
      label: "Note",
      defaultPath: "Note.md",
      content: "# Note\n",
    } as const;

    expect(() => createFileTemplateRegistry([template, template])).toThrow(/duplicate/i);
    expect(() =>
      createFileTemplateRegistry([{ ...template, defaultPath: "../outside.md" }]),
    ).toThrow(/path/i);
  });
});
