import { useEffect, useState } from 'react';
import { useAuth } from './auth-context';
import { apiFetch } from './api';
import type { TextItem } from './item';
import { MediaField } from './MediaField';

// Modal for authoring a text item in an item group. Without an `item` it
// creates one (POST /text-items, from the items page's "Add Item" in a "text"
// group); with an `item` it is prefilled and saves changes (PUT
// /text-items/:id, from a text row's "Edit" button).

interface Props {
  itemGroupId: string;
  item?: TextItem; // the item to edit; omit to create a new one
  defaultItemNumber: number; // prefilled number for a new item
  onSaved: () => void;
  onClose: () => void;
}

export function TextItemFormModal({ itemGroupId, item, defaultItemNumber, onSaved, onClose }: Props) {
  const { token } = useAuth();
  // Kept as a string so the input can be cleared while typing; parsed on save.
  const [itemNumber, setItemNumber] = useState(String(item?.itemNumber ?? defaultItemNumber));
  const [content, setContent] = useState(item?.content ?? '');
  const [media, setMedia] = useState(item?.media ?? '');
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

  const save = async () => {
    const number = Number(itemNumber);
    if (!Number.isInteger(number) || number < 1) {
      setError('Item number must be a whole number of 1 or more.');
      return;
    }
    if (!content.trim()) {
      setError('Content is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = { itemNumber: number, content, media: media.trim() || null };
      if (item) await apiFetch(`/text-items/${item.id}`, token, { method: 'PUT', body });
      else await apiFetch('/text-items', token, { method: 'POST', body: { ...body, itemGroupId: Number(itemGroupId) } });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the text item.');
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
        aria-labelledby="text-item-form-heading"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5 text-left shadow-[var(--shadow)]"
      >
        <h3 id="text-item-form-heading" className="m-0 text-xl font-semibold text-[var(--text-h)]">
          {item ? `Edit text item ${item.id}` : 'Add Text Item'}
        </h3>

        <label className={labelClass}>
          Item number
          <input
            type="number"
            min={1}
            value={itemNumber}
            onChange={(e) => setItemNumber(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Content
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} className={inputClass} autoFocus />
        </label>

        <MediaField
          media={media}
          setMedia={setMedia}
          uploadPath={item ? `/text-items/${item.id}/images` : '/text-items/images'}
          token={token}
          uploading={uploading}
          setUploading={setUploading}
          setError={setError}
          labelClass={labelClass}
          inputClass={inputClass}
        />

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

const labelClass = 'flex flex-col gap-1';

const inputClass = 'rounded border border-gray-300 p-2';

const buttonClass = 'rounded border border-gray-300 px-4 py-2 hover:opacity-90 disabled:opacity-50';
