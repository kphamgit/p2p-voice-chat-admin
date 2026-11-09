import { TextStyle } from '@tiptap/extension-text-style'
import { FontSize } from '@tiptap/extension-text-style' // Replace with a compatible extension or remove if unnecessary
import { EditorContent, useEditor, Editor} from '@tiptap/react'
import Color from "@tiptap/extension-color";
import { BackColor } from "./extensions/backgroundColor";
import { SenseMark, getEditorText, getSenseAt, getSenseWords, setSenseAt } from "./extensions/senseMark";
import StarterKit from '@tiptap/starter-kit'
import TextAlign from "@tiptap/extension-text-align";
//import ResizableImage from 'tiptap-extension-resize-image'
import { ResizableImage } from 'tiptap-extension-resizable-image'
import 'tiptap-extension-resizable-image/styles.css';
import './styles.css';

import { useId, useImperativeHandle, useEffect } from 'react';

interface MyProps {
  initialContent: string | undefined;
  ref: React.Ref<EditorRef>;
}
export interface EditorRef {
  get_content: () => string | undefined;
  get_text: () => string | undefined; // plain text only (no HTML tags or pictures)
  // Vocabulary marks on the word at `start` (an offset in get_text()), tying it to a dictionary sense.
  get_sense_at: (start: number, word: string) => number | null;
  set_sense_at: (start: number, word: string, senseId: number | null) => boolean;
  get_sense_words: () => string[]; // marked words as written, e.g. ["farmers", "harvest"]

}

/*
  content: `
        <p>Adjusting font sizes can greatly affect the readability of your text, making it easier for users to engage with your content.</p>
        <p>When designing a website, it's crucial to balance large headings and smaller body text for a clean, organized layout.</p>
        <p>When setting font sizes, it's important to consider accessibility, ensuring that text is readable for users with different visual impairments.</p>
        <p><span style="font-size: 10px">Too small</span> a font size can strain the eyes, while <span style="font-size: 40px">too large</span> can disrupt the flow of the design.</p>
        <p>When designing for mobile, font sizes should be adjusted to maintain readability on smaller screens.</p>
      `,
*/

// Admin copy (from phuyenenglish.net): props are destructured and every hook
// runs before the early return, as React requires; the editor's CSS class is
// set once in useEditor instead of with setOptions on every render.
const SimpleEditor = ({ initialContent, ref }: MyProps) => {

  // A form can hold several editors, so each one's color labels need their own input ids.
  const id = useId();

  const editor = useEditor({
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit,
      TextStyle,
      FontSize,
      Color,
      BackColor,
      SenseMark,
      ResizableImage,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'my-custom-class',
      },
    },
  }) as Editor;

  useEffect(() => {
    if (editor && initialContent !== undefined) {
      editor.commands.setContent(initialContent);
    }
  }, [initialContent, editor]);

  useImperativeHandle(ref, () => ({
    get_content() {
      return editor.getHTML();
    },
    get_text() {
      return getEditorText(editor);
    },
    get_sense_at(start, word) {
      return getSenseAt(editor, start, word);
    },
    set_sense_at(start, word, senseId) {
      return setSenseAt(editor, start, word, senseId);
    },
    get_sense_words() {
      return getSenseWords(editor);
    }
  }), [editor]);

  if (!editor) {
    return null
  }

  return (
    <div className="m-2 p-3 rounded-lg bg-success-soft">
      <div className="flex flex-row flex-wrap justify-start items-center gap-1 text-content mt-1">
        <div className="flex items-center gap-1">
        <label htmlFor={`${id}-setColor`}>Text color</label>
        <input
            id={`${id}-setColor`}
            type="color"
            onInput={event => editor.chain().focus().setColor((event.target as HTMLInputElement).value).run()}
            value={editor.getAttributes('textStyle').color}
            data-testid="setColor"
          />
        </div>
        <div className="flex items-center gap-1">
        <label htmlFor={`${id}-setBackColor`}>Highlight color</label>
        <input
            id={`${id}-setBackColor`}
            type="color"
            onInput={event => editor.chain().focus().setBackColor((event.target as HTMLInputElement).value).run()}
            value={editor.getAttributes('textStyle').backColor}
            data-testid="setBackColor"
          />
        </div>
        <div className="flex justify-center gap-2 items-center">
          <label className="text-content">Font size:</label>
          <select
            value={editor.getAttributes('textStyle').fontSize || ''}
            onChange={(e) => {
              const size = e.target.value
              if (size) {
                editor.chain().focus().setFontSize(size).run()
              } else {
                editor.chain().focus().unsetFontSize().run()
              }
            }}
            data-test-id="font-size-select"
            className="p-2 m-1 rounded border border-default bg-surface text-content"
          >
            <option value="">Default</option>
            {['11px', '12px', '14px', '16px', '18px', '20px', '22px', '24px', '28px', '32px'].map((size) => (
              <option key={size} value={size} data-test-id={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
  
        <div>  
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={
              !editor.can()
                .chain()
                .focus()
                .toggleBold()
                .run()
            }
            className={editor.isActive('bold') ? 
              'is-active bg-accent-soft font-extrabold text-content hover:text-accent-contrast hover:opacity-90 p-2 m-2 rounded' : 
              'p-2 m-2 rounded bg-surface text-content hover:opacity-90'}
          >
            bold
          </button>
        </div>
        <div>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={
              !editor.can()
                .chain()
                .focus()
                .toggleItalic()
                .run()
            }
            className={editor.isActive('italic') ? 
              'is-active  bg-accent-soft md:italic text-content hover:text-accent-contrast hover:opacity-90 p-2 m-2 rounded' : 
              'p-2 m-2 rounded bg-surface text-content hover:opacity-90'}
          >
            italic
          </button>
        </div>
        <div>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            disabled={
              !editor.can()
                .chain()
                .focus()
                .toggleStrike()
                .run()
            }
           className={editor.isActive('strike') ? 
              'is-active  bg-accent-soft line-through text-content hover:text-accent-contrast hover:opacity-90 p-2 m-2 rounded' : 
               'p-2 m-2 rounded bg-surface text-content hover:opacity-90'}
          >
            strike
          </button>
        </div>
        <div>
        <button
          type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={
              !editor.can()
                .chain()
                .focus()
                .undo()
                .run()
            }
            className={editor.isActive('strike') ? 
              'is-active  bg-accent-soft line-through text-content hover:text-accent-contrast hover:opacity-90 p-2 m-2 rounded' : 
               'p-2 m-2 rounded bg-surface text-content hover:opacity-90'}
    
          >
            Undo
          </button>
          </div>
 
      </div>
      <div className=' overflow-y-auto border-2 border-default rounded-lg p-2 mt-2'>
      <EditorContent editor={editor} />
      </div>
    </div>
  )
}

export default SimpleEditor