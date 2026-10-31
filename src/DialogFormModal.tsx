import { useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import { apiFetch } from './api';
import type { Dialog } from './DialogsManager';

// Ported from p2p-voice-chat-client. Modal for authoring a dialog/conversation
// script. Without a `dialog` it creates one (POST /dialogs, from the list's
// "New" button); with a `dialog` it is prefilled and saves changes
// (PUT /dialogs/:id, from a dialog's "Edit" button). The Dialog model requires
// both a title and text (note is optional); the saved dialog is handed back via
// onSaved so the list can show it without refetching.

interface Props {
  dialog?: Dialog; // the dialog to edit; omit to create a new one
  defaultDialogNumber: number; // prefilled number for a new dialog
  onSaved: (dialog: Dialog) => void;
  onCancel: () => void;
}

export function DialogFormModal({ dialog, defaultDialogNumber, onSaved, onCancel }: Props) {
  const { token } = useAuth();
  const isEdit = dialog !== undefined;
  // Kept as a string so the input can be cleared while typing; parsed on save.
  const [dialogNumber, setDialogNumber] = useState(String(dialog?.dialogNumber ?? defaultDialogNumber));
  const [title, setTitle] = useState(dialog?.title ?? '');
  const [text, setText] = useState(dialog?.text ?? '');
  const [note, setNote] = useState(dialog?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape closes the modal (but not mid-save, so a pending request isn't orphaned).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onCancel]);

  const save = async () => {
    if (!title.trim() || !text.trim()) {
      setError('Both a title and the dialog text are required.');
      return;
    }
    const number = Number(dialogNumber);
    if (!Number.isInteger(number) || number < 1) {
      setError('Dialog number must be a whole number of 1 or more.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await apiFetch<Dialog>(isEdit ? `/dialogs/${dialog.id}` : '/dialogs', token, {
        method: isEdit ? 'PUT' : 'POST',
        // An empty note is stored as null rather than "". On edit it must be sent
        // as an explicit null so clearing the note actually removes it (the PUT
        // handler leaves undefined fields unchanged).
        body: {
          title: title.trim(),
          text: text.trim(),
          note: note.trim() || null,
          dialogNumber: number,
        },
      });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
      setSaving(false);
    }
  };

  return (
    // Backdrop: clicking outside the panel closes the modal (unless saving).
    <div
      onClick={() => !saving && onCancel()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-form-heading"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-xl flex-col gap-2.5 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5 text-left shadow-[var(--shadow)]"
      >
        <h3 id="dialog-form-heading" className="m-0 text-xl font-semibold text-[var(--text-h)]">
          {isEdit ? '✏️ Edit Dialog' : '✍️ New Dialog'}
        </h3>

        <label className={labelClass}>
          Dialog number
          <input
            type="number"
            min={1}
            step={1}
            value={dialogNumber}
            onChange={(e) => setDialogNumber(e.target.value)}
            className={`${inputClass} w-30`}
          />
        </label>

        <label className={labelClass}>
          Title
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. At the restaurant"
            autoFocus
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Dialog text
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'A: Hello!\nB: Hi, how are you?'}
            rows={10}
            className={`${inputClass} min-h-44 resize-y text-lg leading-normal`}
          />
        </label>

        <label className={labelClass}>
          Note (optional)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Practice ordering food; focus on polite requests."
            rows={3}
            className={`${inputClass} resize-y leading-normal`}
          />
        </label>

        {error && (
          <p className="m-0 text-red-600" role="alert">
            ⚠️ {error}
          </p>
        )}

        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className={`${buttonClass} flex-1 bg-green-600 text-white`}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save dialog'}
          </button>
          <button onClick={onCancel} disabled={saving} className={buttonClass}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default DialogFormModal;

const labelClass = 'flex flex-col gap-1';

const inputClass = 'rounded border border-gray-300 p-2 font-[inherit]';

const buttonClass = 'rounded border border-gray-300 px-4 py-2.5 hover:opacity-90 disabled:opacity-50';
