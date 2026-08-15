import { parseWorkspacePath } from "../workspace/workspace-path";

export type FileTemplate = Readonly<{
  id: string;
  label: string;
  defaultPath: string;
  content: string;
}>;

export type FileTemplateRegistry = Readonly<{
  templates: readonly FileTemplate[];
  get(id: string): FileTemplate | null;
}>;

export function createFileTemplateRegistry(
  templates: readonly FileTemplate[],
): FileTemplateRegistry {
  const frozen = Object.freeze(templates.map((template) => Object.freeze({ ...template })));
  const ids = new Set<string>();
  for (const template of frozen) {
    if (!/^[a-z][a-z0-9-]*$/.test(template.id)) {
      throw new Error(`Invalid file template ID: ${template.id}`);
    }
    if (ids.has(template.id)) throw new Error(`Found duplicate file template ID: ${template.id}`);
    ids.add(template.id);
    if (template.label.trim().length === 0) throw new Error("File template label is required");
    if (!parseWorkspacePath(template.defaultPath).ok) {
      throw new Error(`Invalid file template path: ${template.defaultPath}`);
    }
    if (template.content.length === 0) throw new Error("File template content is required");
  }
  return Object.freeze({
    templates: frozen,
    get(id) {
      return frozen.find((template) => template.id === id) ?? null;
    },
  });
}

export const DEFAULT_FILE_TEMPLATE_REGISTRY = createFileTemplateRegistry([
  {
    id: "meeting-notes",
    label: "Meeting notes",
    defaultPath: "Meeting notes.md",
    content: "# Meeting notes\n\n## Attendees\n\n## Agenda\n\n## Notes\n\n## Actions\n\n- [ ] \n",
  },
  {
    id: "project-brief",
    label: "Project brief",
    defaultPath: "Project brief.md",
    content: "# Project brief\n\n## Goal\n\n## Scope\n\n## Milestones\n\n## Risks\n",
  },
  {
    id: "task-list",
    label: "Task list",
    defaultPath: "Task list.md",
    content: "# Tasks\n\n- [ ] \n",
  },
]);
