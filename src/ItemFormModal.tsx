import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import SimpleEditor, { type EditorRef } from './components/tiptap_editor/SimpleEditor';
import { useAuth } from './auth-context';
import { apiFetch } from './api';
import { QUESTION_FORMATS, type QuestionItem } from './item';

// Modal for authoring an item in an item group. Without an `item` it creates one
// (POST /question-items, from the items page's "Add Item" button); with an `item` it is
// prefilled and saves changes (PUT /question-items/:id, from a row's "Edit" button).
// The parent item group's item type decides what is created: the question fields
// only appear (and are only sent) when the group holds "question" items.
// A "text" group's items, and items of a group with no type set, have just a number.

interface Props {
  itemGroupId: string;
  itemType: string; // the parent item group's item type ('' when unset)
  item?: QuestionItem; // the item to edit; omit to create a new one
  defaultItemNumber: number; // prefilled number for a new item
  defaultFormat?: number; // prefilled format for a new item (default 1)
  onSaved: () => void;
  onClose: () => void;
}

export function ItemFormModal({ itemGroupId, itemType, item, defaultItemNumber, defaultFormat = 1, onSaved, onClose }: Props) {
  const { token } = useAuth();
  const isEdit = item !== undefined;
  // Kept as a string so the input can be cleared while typing; parsed on save.
  const [itemNumber, setItemNumber] = useState(String(item?.itemNumber ?? defaultItemNumber));
  const [questionText, setQuestionText] = useState(item?.questionText ?? '');
  const [questionPrompt, setQuestionPrompt] = useState(item?.questionPrompt ?? '');
  const [answerKey, setAnswerKey] = useState(item?.answerKey ?? '');
  const [choices, setChoices] = useState(item?.choices ?? '');
  // A Button Select (format 3) edits its choices one per row instead, at
  // least two; they're saved joined with slashes like any other choices.
  const [choiceRows, setChoiceRows] = useState(() => {
    const rows = choiceList(item?.choices ?? '');
    while (rows.length < 2) rows.push('');
    return rows;
  });
  // String for the same reason as itemNumber. New items start at defaultFormat.
  const [format, setFormat] = useState(String(item?.format ?? defaultFormat));
  const [media, setMedia] = useState(item?.media ?? '');
  // Explanation is rich text (HTML) from the Tiptap editor, read via its ref on save.
  const explanationEditor = useRef<EditorRef>(null);
  const [showExplanationWhenCorrect, setShowExplanationWhenCorrect] = useState(
    item?.showExplanationWhenCorrect ?? false,
  );
  const [uploading, setUploading] = useState(0); // images being uploaded right now
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape closes the modal (but not mid-save, so a pending request isn't orphaned).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const isQuestion = itemType === 'question';
  // Which question fields apply depends on the format (see QUESTION_FORMATS).
  // A Cloze (1), Words Scramble (6) or Words Select (8) question has no choices.
  const showChoices = ![1, 6, 8].includes(Number(format));
  // A Button Select question (format 3) is plain text: the student picks the
  // answer from the choices, so there are no [blanks] in the question.
  const isButtonSelect = Number(format) === 3;
  // A Button Select's answer key names the correct choice by position,
  // "choice1" for the first; the student app checks the tapped button's index.
  const choicesValue = isButtonSelect ? choiceRows.map((c) => c.trim()).join('/') : choices;
  const keyedChoice = isButtonSelect ? choiceForKey(answerKey, choicesValue) : null;
  // Words Scramble (6) and Words Select (8) questions are written with
  // slashes between the words.
  const isSlashSeparated = [6, 8].includes(Number(format));

  // Pasting an image into Media uploads it and inserts ![](<url>) where the
  // cursor was. Pasting text works as usual. A new item has no id yet, so its
  // images go to a pending folder; the server moves them to the item's own
  // folder when the item is saved (and deletes them after a day if it isn't).
  const pasteIntoMedia = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(e.clipboardData.items)
      .filter((entry) => entry.kind === 'file' && entry.type.startsWith('image/'))
      .map((entry) => entry.getAsFile())
      .filter((file): file is File => file !== null);
    if (images.length === 0) return; // plain text: let the browser paste it
    e.preventDefault();
    const uploadPath = isEdit ? `/question-items/${item.id}/images` : '/question-items/images';
    const { selectionStart, selectionEnd } = e.currentTarget;
    setUploading((n) => n + 1);
    setError(null);
    try {
      const urls: string[] = [];
      for (const image of images) {
        const form = new FormData();
        form.append('image', image);
        const { url } = await apiFetch<{ url: string }>(uploadPath, token, {
          method: 'POST',
          body: form,
        });
        urls.push(url);
      }
      const inserted = urls.map((url) => `![](${url})`).join('\n');
      setMedia((text) => text.slice(0, selectionStart) + inserted + text.slice(selectionEnd));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploading((n) => n - 1);
    }
  };

  const save = async () => {
    const number = Number(itemNumber);
    if (!Number.isInteger(number) || number < 1) {
      setError('Item number must be a whole number of 1 or more.');
      return;
    }
    if (isQuestion && !questionText.trim()) {
      setError('A question needs question text.');
      return;
    }
    const formatNumber = Number(format);
    if (isQuestion && (format.trim() === '' || !Number.isInteger(formatNumber))) {
      setError('Format must be a whole number.');
      return;
    }
    if (isQuestion && isButtonSelect && /[[\]]/.test(questionText)) {
      setError('A Button Select question has no brackets: write it as plain text.');
      return;
    }
    if (isQuestion && isButtonSelect) {
      if (choiceRows.some((c) => !c.trim())) {
        setError('Fill in every choice, or remove the empty rows. A Button Select needs at least two choices.');
        return;
      }
      if (choiceRows.some((c) => c.includes('/'))) {
        setError('A choice can\'t contain a slash (/).');
        return;
      }
    }
    if (isQuestion && isButtonSelect && answerKey.trim() && !keyedChoice) {
      const count = choiceList(choicesValue).length;
      setError(
        count
          ? `A Button Select answer key is choice1 to choice${count}, the position of the correct choice.`
          : 'A Button Select answer key names one of the choices (choice1 for the first), so add the choices first.',
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(isEdit ? `/question-items/${item.id}` : '/question-items', token, {
        method: isEdit ? 'PUT' : 'POST',
        // Empty question fields are stored as null. Non-question groups leave the
        // question fields out, so any existing values are kept rather than cleared.
        body: {
          itemGroupId: Number(itemGroupId),
          itemNumber: number,
          ...(isQuestion && {
            questionText: questionText.trim() || null,
            questionPrompt: questionPrompt.trim() || null,
            media: media.trim() || null,
            explanation: explanationHtml(explanationEditor.current),
            showExplanationWhenCorrect,
            answerKey: keyedChoice ? `choice${keyedChoice.number}` : answerKey.trim() || null,
            // Hidden fields are left out, so an existing value survives a format switch.
            ...(showChoices && { choices: choicesValue.trim() || null }),
            // Format is only set on create; edits never change it.
            ...(!isEdit && { format: formatNumber }),
          }),
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
      setSaving(false);
    }
  };

  return (
    // Backdrop: clicking outside the panel closes the modal (unless saving).
    <div
      onClick={() => !saving && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-form-heading"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5 text-left shadow-[var(--shadow)]"
      >
        <h3 id="item-form-heading" className="m-0 text-xl font-semibold text-[var(--text-h)]">
          {isEdit ? `Edit item ${item.id}` : 'Add Item'}
        </h3>

        <label className={labelClass}>
          Item number
          <input
            type="number"
            min={1}
            step={1}
            value={itemNumber}
            onChange={(e) => setItemNumber(e.target.value)}
            className={`${inputClass} w-30`}
          />
        </label>

        <p className="m-0">
          Item type: <strong>{itemType || 'not set'}</strong>
          {!itemType && ' (set it on the item group to get the question fields)'}
        </p>

        {isQuestion && (
          <>
            {/* Format comes first: it decides which of the fields below are shown. */}
            {/* An existing item's format is fixed; it can only be chosen when adding. */}
            {isEdit ? (
              <p className="m-0">
                Format: <strong>{formatName(item.format)}</strong>
              </p>
            ) : (
              <label className={labelClass}>
                Format
                <input
                  type="number"
                  step={1}
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className={`${inputClass} w-30`}
                />
              </label>
            )}

            <label className={labelClass}>
              Question prompt (optional)
              <textarea
                value={questionPrompt}
                onChange={(e) => setQuestionPrompt(e.target.value)}
                placeholder="e.g. Choose the correct answer."
                rows={3}
                className={`${inputClass} resize-y font-[inherit] leading-normal`}
              />
            </label>

            <label className={labelClass}>
              Media (optional)
              <textarea
                value={media}
                onChange={(e) => setMedia(e.target.value)}
                onPaste={pasteIntoMedia}
                placeholder="Text, and paste images here (⌘V)"
                rows={3}
                className={`${inputClass} resize-y font-[inherit] leading-normal`}
              />
            </label>
            {uploading > 0 && <p className="m-0 text-sm">Uploading image…</p>}
            {mediaImageUrls(media).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {mediaImageUrls(media).map((url, i) => (
                  <img
                    key={`${url}-${i}`}
                    src={url}
                    // Load with CORS, like the Flutter web app does. Otherwise the
                    // browser caches a copy without CORS headers (for a year) and
                    // then refuses it to the Flutter app on the same localhost.
                    crossOrigin="anonymous"
                    alt={`Media image ${i + 1}`}
                    className="h-20 rounded border border-gray-300 object-contain"
                  />
                ))}
              </div>
            )}

            <label className={labelClass}>
              Question text
              {isSlashSeparated && (
                <span className="text-sm font-normal text-gray-500">Separate words with slashes (/)</span>
              )}
              <input
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                placeholder={
                  isButtonSelect
                    ? 'Plain text, no brackets, e.g. Which word is a verb?'
                    : isSlashSeparated
                      ? 'e.g. I/am/a/student/.'
                      : 'e.g. I [am] a student.'
                }
                className={inputClass}
              />
            </label>

            <label className={labelClass}>
              Answer key
              <input
                value={answerKey}
                onChange={(e) => setAnswerKey(e.target.value)}
                placeholder={isButtonSelect ? 'The correct choice by position, e.g. choice1 for the first' : undefined}
                className={inputClass}
              />
              {keyedChoice && (
                <span className="text-sm font-normal text-gray-500">
                  = choice {keyedChoice.number}: <strong>{keyedChoice.word}</strong>
                </span>
              )}
            </label>

            {isButtonSelect && (
              // A div, not a <label>: it holds several inputs and buttons.
              <div className={labelClass}>
                Choices
                {choiceRows.map((choice, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {/* Picking a row's radio makes it the answer key ("choice2" for the second);
                        the radio follows the key when it's typed in instead. */}
                    <input
                      type="radio"
                      name="answer-choice"
                      checked={keyedChoiceNumber(answerKey) === i + 1}
                      onChange={() => setAnswerKey(`choice${i + 1}`)}
                      aria-label={`Make choice ${i + 1} the answer`}
                    />
                    {/* Numbered as the answer key names them: choice1, choice2, … */}
                    <span className="w-16 shrink-0 text-sm font-normal text-gray-500">choice{i + 1}</span>
                    <input
                      value={choice}
                      onChange={(e) =>
                        setChoiceRows((rows) => rows.map((c, j) => (j === i ? e.target.value : c)))
                      }
                      aria-label={`Choice ${i + 1}`}
                      className={`${inputClass} flex-1`}
                    />
                  </div>
                ))}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setChoiceRows((rows) => [...rows, ''])} className={buttonClass}>
                    Add Row
                  </button>
                  {/* Removes the last row; the first two stay, since a Button Select needs at least two choices. */}
                  {choiceRows.length > 2 && (
                    <button type="button" onClick={() => setChoiceRows((rows) => rows.slice(0, -1))} className={buttonClass}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )}

            {showChoices && !isButtonSelect && (
              <label className={labelClass}>
                Choices
                <input
                  value={choices}
                  onChange={(e) => setChoices(e.target.value)}
                  placeholder="Separated by forward slashes, e.g. run/table/happy"
                  className={inputClass}
                />
              </label>
            )}

            {/* A div, not a <label>: clicks on the editor's toolbar shouldn't be redirected. */}
            <div className={labelClass}>
              Explanation (optional)
              <SimpleEditor initialContent={item?.explanation ?? ''} ref={explanationEditor} />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showExplanationWhenCorrect}
                onChange={(e) => setShowExplanationWhenCorrect(e.target.checked)}
              />
              Show the explanation even when the answer is correct
            </label>
          </>
        )}

        {error && (
          <p className="m-0 text-red-600" role="alert">
            ⚠️ {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={save} disabled={saving || uploading > 0} className={`${buttonClass} bg-green-600 text-white`}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} disabled={saving} className={buttonClass}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default ItemFormModal;

// The explanation editor's HTML, or null when it's empty (Tiptap reports an
// empty editor as "<p></p>", which shouldn't be saved as an explanation).
function explanationHtml(editor: EditorRef | null): string | null {
  const html = editor?.get_content() ?? '';
  const hasText = (editor?.get_text() ?? '').trim() !== '';
  return hasText || html.includes('<img') ? html : null;
}

// The image URLs in media text, in order: each ![...](<url>).
function mediaImageUrls(media: string): string[] {
  return Array.from(media.matchAll(/!\[[^\]]*\]\((\S+?)\)/g), (m) => m[1]);
}

// The choices string's options, as the student app splits them ("am/is/are").
function choiceList(choices: string): string[] {
  return choices
    .split('/')
    .map((c) => c.trim())
    .filter(Boolean);
}

// The choice a Button Select answer key ("choice2", any case) points at, or
// null if it isn't of that form or is past the last choice.
function choiceForKey(answerKey: string, choices: string): { number: number; word: string } | null {
  const number = keyedChoiceNumber(answerKey);
  if (number === null) return null;
  const word = choiceList(choices)[number - 1];
  return word ? { number, word } : null;
}

// The number in a "choiceN" answer key (any case), or null if it isn't one.
function keyedChoiceNumber(answerKey: string): number | null {
  const match = /^choice\s*(\d+)$/i.exec(answerKey.trim());
  return match ? Number(match[1]) : null;
}

// "Cloze (1)", or just the number for a format with no name.
function formatName(format: number): string {
  const label = QUESTION_FORMATS.find((f) => f.value === format)?.label;
  return label ? `${label} (${format})` : String(format);
}

const labelClass = 'flex flex-col gap-1';

const inputClass = 'rounded border border-gray-300 p-2';

const buttonClass = 'rounded border border-gray-300 px-4 py-2 hover:opacity-90 disabled:opacity-50';
