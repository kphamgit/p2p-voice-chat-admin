import { useEffect } from 'react';
import type { QuestionItem } from './item';

// Asked before deleting a question item that has audio (its Audio, Trailing
// audio, or both), in place of the plain "Delete item N?": what happens to
// each audio file. The server never deletes a question's audio with it (see
// the server's src/audio.ts): an audio is shared, and only removed by its
// cleanup once nothing uses it.

interface Props {
  item: QuestionItem;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteAudioItemModal({ item, onConfirm, onCancel }: Props) {
  // Escape cancels, as clicking outside does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const audios = [
    { name: 'Audio', audio: item.audio },
    { name: 'Trailing audio', audio: item.trailingAudio },
  ].filter((a) => a.audio !== null);

  return (
    <div onClick={onCancel} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-audio-item-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-lg bg-white p-5 text-left text-gray-800 shadow-xl"
      >
        <h2 id="delete-audio-item-title" className="m-0 text-lg font-semibold text-gray-900">
          Delete item {item.itemNumber}?
        </h2>
        <p className="m-0 text-sm">
          This question has audio. Deleting the question doesn't delete its audio file right away: the question only
          points to it.
        </p>

        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
          {audios.map(({ name, audio }) => (
            <li key={name} className="rounded border border-gray-200 bg-gray-50 p-2">
              <div>
                <span className="font-medium">{name}:</span> “{audio!.text}”
              </div>
              <div className="text-gray-600">
                {audio!.inLibrary
                  ? 'In the library: kept, for other questions.'
                  : 'Not in the library: deleted by the server’s cleanup, unless another question uses it.'}
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-1 text-sm text-gray-600">
          <p className="m-0">What happens to an audio file:</p>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
            <li>
              <strong>In the library:</strong> kept. It stays available for other questions.
            </li>
            <li>
              <strong>Used by another question</strong> (e.g. a clone of this one): kept. The database won’t delete
              an audio a question still uses.
            </li>
            <li>
              <strong>Used by nothing else:</strong> deleted with its file by the server’s cleanup, which runs at
              startup and every 6 hours. It removes unused audio created more than a day ago, so an older voice goes
              within about 6 hours, and one generated today waits until it’s a day old.
            </li>
          </ul>
          <p className="m-0">
            To keep an audio, cancel and add it to the library first (Edit → Save to library). The question’s pasted
            images are deleted right away.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="rounded border border-red-700 bg-red-600 px-4 py-2 text-white hover:opacity-90"
          >
            Delete
          </button>
          <button type="button" onClick={onCancel} className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-100">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
