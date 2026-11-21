import { useEffect } from 'react';

// "Detail" next to Save to library in an audio section (AudioField): what the
// audio library is, opened over the question form.

export function LibraryHelpModal({ onClose }: { onClose: () => void }) {
  // Escape closes this, and only this: caught before the question form's own
  // Escape (which would close the whole form).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      onClick={(e) => {
        e.stopPropagation(); // not through to the question form's backdrop
        onClose();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-help-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-lg bg-white p-5 text-left text-sm text-gray-800 shadow-xl"
      >
        <h2 id="library-help-title" className="m-0 text-lg font-semibold text-gray-900">
          The audio library
        </h2>
        <p className="m-0">
          The library is your collection of reusable audio: voices you've decided to keep, so other questions can use
          them without generating them again.
        </p>

        <h3 className="m-0 text-base font-semibold text-gray-900">Where the audio is</h3>
        <p className="m-0">
          Every voice is stored in S3 the moment you click Generate voice. Saving the question points it to that file.
          Save to library uploads nothing: it marks the audio as reusable and stores your keywords with it.
        </p>

        <h3 className="m-0 text-base font-semibold text-gray-900">What saving to the library does</h3>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
          <li>
            <strong>Any question can use it.</strong> In any question's Audio or Trailing audio section, choose “Use
            audio from → The library”, search by what the audio says or by its keywords, and check it. The questions
            share the one file; nothing is copied.
          </li>
          <li>
            <strong>It's kept.</strong> A library audio is never deleted automatically, even when no question uses it,
            for example after the question it was made for is deleted.
          </li>
        </ul>

        <h3 className="m-0 text-base font-semibold text-gray-900">Audio outside the library</h3>
        <p className="m-0">
          It's kept for as long as a question uses it. Once nothing uses it (you deleted the question, generated another
          take, or closed the form without saving), the server's cleanup deletes it. The cleanup runs at startup and
          every 6 hours, and only removes audio created more than a day ago.
        </p>

        <h3 className="m-0 text-base font-semibold text-gray-900">When to use it</h3>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
          <li>A voice you've approved and expect to reuse, e.g. a Shadowing sentence for several units.</li>
          <li>Not needed for audio that belongs to just one question: saving the question already keeps it.</li>
          <li>Keywords (e.g. “apology, question intonation”) make it easier to find later.</li>
        </ul>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
