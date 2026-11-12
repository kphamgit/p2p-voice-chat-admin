import { type ClipboardEvent, type Dispatch, type SetStateAction } from 'react';
import { apiFetch } from './api';

// The Media field of the item forms (question items and text items): a
// textarea of text with images inline as ![](<url>), where pasting an image
// uploads it to S3 and inserts it at the cursor, plus a preview of each image
// with a picker for its display size in the student app.
export function MediaField({
  media,
  setMedia,
  uploadPath,
  token,
  uploading,
  setUploading,
  setError,
  labelClass,
  inputClass,
}: {
  media: string;
  setMedia: Dispatch<SetStateAction<string>>;
  // Where pasted images are POSTed, e.g. /text-items/4/images, or
  // /text-items/images for an item not saved yet.
  uploadPath: string;
  token: string | null;
  uploading: number; // images being uploaded right now (the form disables Save meanwhile)
  setUploading: Dispatch<SetStateAction<number>>;
  setError: (message: string | null) => void;
  labelClass: string;
  inputClass: string;
}) {
  // Pasting an image uploads it and inserts ![](<url>) where the cursor was.
  // Pasting text works as usual. A new item has no id yet, so its images go to
  // a pending folder; the server moves them to the item's own folder when the
  // item is saved (and deletes them after a day if it isn't).
  const pasteIntoMedia = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(e.clipboardData.items)
      .filter((entry) => entry.kind === 'file' && entry.type.startsWith('image/'))
      .map((entry) => entry.getAsFile())
      .filter((file): file is File => file !== null);
    if (images.length === 0) return; // plain text: let the browser paste it
    e.preventDefault();
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

  const images = mediaImages(media);

  return (
    <>
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
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map(({ url, size }, i) => (
            <div key={`${url}-${i}`} className="flex flex-col items-start gap-1">
              <img
                src={url}
                // Load with CORS, like the Flutter web app does. Otherwise the
                // browser caches a copy without CORS headers (for a year) and
                // then refuses it to the Flutter app on the same localhost.
                crossOrigin="anonymous"
                alt={`Media image ${i + 1}`}
                className="h-20 rounded border border-gray-300 object-contain"
              />
              {/* How wide the student app shows it, as a share of the item's width
                  (written into the media text as ![50%](url)). */}
              <select
                value={size ?? ''}
                onChange={(e) => setMedia((m) => withImageSize(m, i, e.target.value ? Number(e.target.value) : null))}
                aria-label={`Display size of media image ${i + 1}`}
                className="rounded border border-gray-300 p-1 text-sm"
              >
                <option value="">Default size</option>
                {/* A size typed into the text by hand that isn't in the list still shows. */}
                {size !== null && !IMAGE_SIZES.includes(size) && <option value={size}>{size}% width</option>}
                {IMAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}% width
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// The images in the media text, ![<alt>](<url>), in order. The alt slot holds
// an image's display size in the student app, e.g. ![50%](url): that share of
// the item's width. An image without one (![](url)) gets the default size.
const MEDIA_IMAGE = /!\[([^\]]*)\]\((\S+?)\)/g;

// The sizes offered in each image's size picker, in % of the item's width.
const IMAGE_SIZES = [25, 50, 75, 100];

function mediaImages(media: string): { url: string; size: number | null }[] {
  return Array.from(media.matchAll(MEDIA_IMAGE), (m) => ({ url: m[2], size: imageSize(m[1]) }));
}

// "50%" → 50; null for anything else (no size, or out of 1–100).
function imageSize(alt: string): number | null {
  const match = /^\s*(\d{1,3})\s*%\s*$/.exec(alt);
  const size = match ? Number(match[1]) : NaN;
  return size >= 1 && size <= 100 ? size : null;
}

// The media text with its `index`-th image's size set (null: default size).
function withImageSize(media: string, index: number, size: number | null): string {
  let n = 0;
  return media.replace(MEDIA_IMAGE, (whole, _alt: string, url: string) =>
    n++ === index ? `![${size === null ? '' : `${size}%`}](${url})` : whole,
  );
}
