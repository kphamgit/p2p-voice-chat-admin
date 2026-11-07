import { useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import { apiFetch } from './api';
import { type QuestionItem } from './item';

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
  onSaved: () => void;
  onClose: () => void;
}

export function ItemFormModal({ itemGroupId, itemType, item, defaultItemNumber, onSaved, onClose }: Props) {
  const { token } = useAuth();
  const isEdit = item !== undefined;
  // Kept as a string so the input can be cleared while typing; parsed on save.
  const [itemNumber, setItemNumber] = useState(String(item?.itemNumber ?? defaultItemNumber));
  const [questionText, setQuestionText] = useState(item?.questionText ?? '');
  const [questionPrompt, setQuestionPrompt] = useState(item?.questionPrompt ?? '');
  const [answerKey, setAnswerKey] = useState(item?.answerKey ?? '');
  const [choices, setChoices] = useState(item?.choices ?? '');
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
            answerKey: answerKey.trim() || null,
            choices: choices.trim() || null,
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
              <input
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                className={inputClass}
              />
            </label>

            <label className={labelClass}>
              Answer key
              <input value={answerKey} onChange={(e) => setAnswerKey(e.target.value)} className={inputClass} />
            </label>

            <label className={labelClass}>
              Choices
              <input value={choices} onChange={(e) => setChoices(e.target.value)} className={inputClass} />
            </label>
          </>
        )}

        {error && (
          <p className="m-0 text-red-600" role="alert">
            ⚠️ {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={save} disabled={saving} className={`${buttonClass} bg-green-600 text-white`}>
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

const labelClass = 'flex flex-col gap-1';

const inputClass = 'rounded border border-gray-300 p-2';

const buttonClass = 'rounded border border-gray-300 px-4 py-2 hover:opacity-90 disabled:opacity-50';
