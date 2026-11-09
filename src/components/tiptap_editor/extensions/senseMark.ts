import { Mark, mergeAttributes, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

// Marks a word in a quiz reading as a vocabulary word tied to a Viet dictionary sense.
// Saved in the reading HTML as <span data-sense-id="812" class="sense-word">farmers</span>;
// the student app turns these spans into clickable words that add the sense's card to review.
// Being a mark (like bold), it stays on its word when the text around it is edited.

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    senseMark: {
      setSenseMark: (senseId: number) => ReturnType;
      unsetSenseMark: () => ReturnType;
    };
  }
}

export const SenseMark = Mark.create({
  name: "senseMark",

  // Typing right after a marked word shouldn't extend the mark onto the new text.
  inclusive: false,

  addAttributes() {
    return {
      senseId: {
        default: null,
        parseHTML: (element) => {
          const value = Number(element.getAttribute("data-sense-id"));
          return Number.isInteger(value) && value > 0 ? value : null;
        },
        renderHTML: (attributes) =>
          attributes.senseId ? { "data-sense-id": String(attributes.senseId) } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-sense-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "sense-word" }), 0];
  },

  addCommands() {
    return {
      setSenseMark:
        (senseId) =>
        ({ commands }) =>
          commands.setMark(this.name, { senseId }),
      unsetSenseMark:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

// --- Locating words by their offset in the editor's plain text ---
// The reading is tokenized (spaCy) from plain text, and each token comes back with its character
// offset in that text. To mark a token, we need the matching editor (ProseMirror) positions, so
// the plain text is built here together with the position of every character in it.

interface TextMap {
  text: string;
  positions: number[]; // positions[i] = editor position of text[i], or -1 for separators
}

const buildTextMap = (doc: PMNode): TextMap => {
  let text = "";
  const positions: number[] = [];
  let firstBlock = true;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true; // keep descending into lists, blockquotes, etc.
    if (!firstBlock) {
      text += "\n\n"; // paragraphs separated by a blank line, like editor.getText()
      positions.push(-1, -1);
    }
    firstBlock = false;
    node.forEach((child, offset) => {
      const childPos = pos + 1 + offset;
      if (child.isText && child.text) {
        text += child.text;
        for (let i = 0; i < child.text.length; i++) positions.push(childPos + i);
      } else {
        // A line break or an inline picture: keep the words on either side apart.
        text += child.type.name === "hardBreak" ? "\n" : " ";
        positions.push(-1);
      }
    });
    return false;
  });
  return { text, positions };
};

// Plain text of the editor, the text that tokenized offsets refer to.
export const getEditorText = (editor: Editor) => buildTextMap(editor.state.doc).text;

// Editor range of the word at `start` in the plain text, or null if the text there no longer
// matches `word` (e.g. it was edited after tokenizing).
const findWordRange = (editor: Editor, start: number, word: string) => {
  const { text, positions } = buildTextMap(editor.state.doc);
  const end = start + word.length;
  if (start < 0 || end > text.length || text.slice(start, end) !== word) return null;
  const from = positions[start];
  const last = positions[end - 1];
  if (from < 0 || last < 0 || last - from !== word.length - 1) return null;
  return { from, to: last + 1 };
};

// Sense id marked on the word at `start`, or null if it isn't marked.
export const getSenseAt = (editor: Editor, start: number, word: string): number | null => {
  const range = findWordRange(editor, start, word);
  if (!range) return null;
  const markType = editor.schema.marks.senseMark;
  let senseId: number | null = null;
  editor.state.doc.nodesBetween(range.from, range.to, (node) => {
    const mark = node.marks.find((m) => m.type === markType);
    if (mark && senseId === null) senseId = mark.attrs.senseId;
  });
  return senseId;
};

// Mark the word at `start` with `senseId`, or unmark it when `senseId` is null.
// Returns false if the word couldn't be found at that offset.
export const setSenseAt = (editor: Editor, start: number, word: string, senseId: number | null) => {
  const range = findWordRange(editor, start, word);
  if (!range) return false;
  const markType = editor.schema.marks.senseMark;
  const tr = editor.state.tr.removeMark(range.from, range.to, markType);
  if (senseId !== null) tr.addMark(range.from, range.to, markType.create({ senseId }));
  editor.view.dispatch(tr);
  return true;
};

// The marked vocabulary words in the editor, as written (e.g. "farmers"), without duplicates.
// A word split across formatting (e.g. half bold) is several text nodes with the same mark,
// so neighbouring nodes with the same sense id are joined back into one word.
export const getSenseWords = (editor: Editor): string[] => {
  const markType = editor.schema.marks.senseMark;
  const words = new Set<string>();
  editor.state.doc.descendants((node) => {
    if (!node.isTextblock) return true;
    let current = "";
    let currentSense: number | null = null;
    const flush = () => {
      if (current.trim()) words.add(current.trim());
      current = "";
      currentSense = null;
    };
    node.forEach((child) => {
      const senseId = child.isText ? child.marks.find((m) => m.type === markType)?.attrs.senseId ?? null : null;
      if (senseId === null || senseId !== currentSense) flush();
      if (senseId !== null) {
        current += child.text ?? "";
        currentSense = senseId;
      }
    });
    flush();
    return false;
  });
  return [...words];
};
