import { useEffect, useRef, useState } from 'react';
import SimpleEditor, { type EditorRef } from './components/tiptap_editor/SimpleEditor';
import { useAuth } from './auth-context';
import { apiFetch } from './api';
import { MediaField } from './MediaField';
import { QUESTION_FORMATS, type QuestionItem } from './item';
import { VoiceField, type VoiceValue } from './VoiceField';

// Modal for authoring an item in an item group. Without an `item` it creates one
// (POST /question-items, from the items page's "Add Item" button in a "question"
// group); with an `item` it is prefilled and saves changes (PUT
// /question-items/:id, from a question row's "Edit" button).
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
  // The question's audio and its trailing audio: generated voices (see VoiceField).
  // A Button Select's "same as question text" boxes start checked when the
  // saved text is the question text.
  const [mainVoice, setMainVoice] = useState<VoiceValue>(() =>
    savedVoice(item?.audio, item?.audioText, item?.voiceName, item),
  );
  const [trailingVoice, setTrailingVoice] = useState<VoiceValue>(() =>
    savedVoice(item?.trailingAudio, item?.trailingAudioText, item?.trailingVoiceName, item),
  );
  const [generating, setGenerating] = useState(0); // voices being generated right now
  const onGeneratingChange = (g: boolean) => setGenerating((n) => n + (g ? 1 : -1));
  // Explanation is rich text (HTML) from the Tiptap editor, read via its ref on save.
  const explanationEditor = useRef<EditorRef>(null);
  const [showExplanationWhenCorrect, setShowExplanationWhenCorrect] = useState(
    item?.showExplanationWhenCorrect ?? false,
  );
  // Only applies to format 8 (Words Select).
  const [checkOrder, setCheckOrder] = useState(item?.checkOrder ?? false);
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
  const isWordsSelect = Number(format) === 8;
  // What a voice says: the question text while a Button Select's "same as
  // question text" is checked, otherwise its own text.
  const voiceText = (v: VoiceValue) => (isButtonSelect && v.sameAsQuestion ? questionText : v.text).trim() || null;

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
            audio: mainVoice.audio,
            audioText: voiceText(mainVoice),
            voiceName: mainVoice.audio ? mainVoice.voiceName : null,
            trailingAudio: trailingVoice.audio,
            trailingAudioText: voiceText(trailingVoice),
            trailingVoiceName: trailingVoice.audio ? trailingVoice.voiceName : null,
            explanation: explanationHtml(explanationEditor.current),
            showExplanationWhenCorrect,
            answerKey: keyedChoice ? `choice${keyedChoice.number}` : answerKey.trim() || null,
            // Hidden fields are left out, so an existing value survives a format switch.
            ...(showChoices && { choices: choicesValue.trim() || null }),
            ...(isWordsSelect && { checkOrder }),
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
          {isEdit ? `Edit item ${item.id}` : 'Add Question Item'}
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

            <MediaField
              media={media}
              setMedia={setMedia}
              uploadPath={isEdit ? `/question-items/${item.id}/images` : '/question-items/images'}
              token={token}
              uploading={uploading}
              setUploading={setUploading}
              setError={setError}
              labelClass={labelClass}
              inputClass={inputClass}
            />

            <VoiceField
              title="Audio (optional)"
              noun="audio"
              placeholder="e.g. I am a student."
              value={mainVoice}
              setValue={setMainVoice}
              savedAudio={item?.audio ?? null}
              isEdit={isEdit}
              initialVoice={item?.voiceName}
              questionText={isButtonSelect ? questionText : undefined}
              token={token}
              setError={setError}
              onGeneratingChange={onGeneratingChange}
              labelClass={labelClass}
              inputClass={inputClass}
              buttonClass={buttonClass}
            />

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
              Question text
              {isSlashSeparated && (
                <span className="text-sm font-normal text-gray-500">Separate words with slashes (/)</span>
              )}
              <div className="flex gap-2">
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
                  className={`${inputClass} flex-1`}
                />
                {/* Words Scramble (6) and Words Select (8). */}
                {isSlashSeparated && (
                  <button
                    type="button"
                    onClick={() => setQuestionText(insertSlashes(questionText))}
                    disabled={!questionText.trim()}
                    className="shrink-0 rounded border border-gray-300 px-3 py-2 text-sm font-normal hover:opacity-90 disabled:opacity-50"
                  >
                    Insert slashes
                  </button>
                )}
              </div>
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

            {/* Words Select (8) only. */}
            {isWordsSelect && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={checkOrder} onChange={(e) => setCheckOrder(e.target.checked)} />
                Check order
                <span className="text-sm font-normal text-gray-500">(the selected words must match the answer key's order)</span>
              </label>
            )}

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

            <VoiceField
              title="Trailing audio (optional)"
              noun="trailing audio"
              placeholder="e.g. I am a student."
              value={trailingVoice}
              setValue={setTrailingVoice}
              savedAudio={item?.trailingAudio ?? null}
              isEdit={isEdit}
              initialVoice={item?.trailingVoiceName ?? item?.voiceName}
              questionText={isButtonSelect ? questionText : undefined}
              token={token}
              setError={setError}
              onGeneratingChange={onGeneratingChange}
              labelClass={labelClass}
              inputClass={inputClass}
              buttonClass={buttonClass}
            />
          </>
        )}

        {error && (
          <p className="m-0 text-red-600" role="alert">
            ⚠️ {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={save} disabled={saving || uploading > 0 || generating > 0} className={`${buttonClass} bg-green-600 text-white`}>
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

// The starting value of a VoiceField, from an item's saved audio fields
// (undefined for a new item). "Same as question text" starts checked for a
// saved Button Select whose voice text is its question text.
function savedVoice(
  audio: string | null | undefined,
  text: string | null | undefined,
  voiceName: string | null | undefined,
  item: QuestionItem | undefined,
): VoiceValue {
  const sameAsQuestion = item?.format === 3 && !!text?.trim() && text.trim() === item.questionText?.trim();
  return { audio: audio ?? null, text: text ?? '', voiceName: audio ? (voiceName ?? null) : null, sameAsQuestion };
}

// The explanation editor's HTML, or null when it's empty (Tiptap reports an
// empty editor as "<p></p>", which shouldn't be saved as an explanation).
function explanationHtml(editor: EditorRef | null): string | null {
  const html = editor?.get_content() ?? '';
  const hasText = (editor?.get_text() ?? '').trim() !== '';
  return hasText || html.includes('<img') ? html : null;
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

// "I am a student." → "I/am/a/student/." for a Words Scramble (6) or Words
// Select (8) question: one
// slash between words, and trailing punctuation (. , ! ? ; :) split off as its
// own piece. Existing slashes count as separators, so clicking twice is harmless.
function insertSlashes(text: string): string {
  return text
    .split(/[\s/]+/)
    .flatMap((word) => {
      const m = /^(.*?)([.,!?;:]+)$/.exec(word);
      return m ? [m[1], m[2]] : [word];
    })
    .filter(Boolean)
    .join('/');
}

// "Cloze (1)", or just the number for a format with no name.
function formatName(format: number): string {
  const label = QUESTION_FORMATS.find((f) => f.value === format)?.label;
  return label ? `${label} (${format})` : String(format);
}

const labelClass = 'flex flex-col gap-1';

const inputClass = 'rounded border border-gray-300 p-2';

const buttonClass = 'rounded border border-gray-300 px-4 py-2 hover:opacity-90 disabled:opacity-50';
