import { CodeBlock } from "@tiptap/extension-code-block";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { highlightCodeParts } from "../formats/code-highlight";

const pluginKey = new PluginKey<DecorationSet>("code-block-syntax-highlighting");

function codeDecorations(documentNode: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  documentNode.descendants((node, position) => {
    if (node.type.name !== "codeBlock" || node.textContent.length === 0) return;
    const language = typeof node.attrs.language === "string" ? node.attrs.language : "";
    let offset = position + 1;
    for (const part of highlightCodeParts(node.textContent, language)) {
      const from = offset;
      offset += part.text.length;
      if (part.classes && offset > from) {
        decorations.push(Decoration.inline(from, offset, { class: part.classes }));
      }
    }
  });
  return DecorationSet.create(documentNode, decorations);
}

export const HighlightedCodeBlock = CodeBlock.extend({
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: pluginKey,
        state: {
          init: (_configuration, state) => codeDecorations(state.doc),
          apply: (transaction, previous) =>
            transaction.docChanged
              ? codeDecorations(transaction.doc)
              : previous.map(transaction.mapping, transaction.doc),
        },
        props: {
          decorations: (state) => pluginKey.getState(state) ?? DecorationSet.empty,
        },
      }),
    ];
  },
});
