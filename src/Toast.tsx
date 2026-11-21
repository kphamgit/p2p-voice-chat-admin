import { useEffect, type ReactNode } from 'react';

// A short message in the center of the screen, above any modal, that goes
// away by itself after `durationMs` (or when its × is clicked). Render it
// while there's a message; give it a new `key` to restart it for a new one.

interface Props {
  children: ReactNode;
  onDone: () => void;
  durationMs?: number;
}

export function Toast({ children, onDone, durationMs = 10000 }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDone, durationMs);
    return () => clearTimeout(timer);
  }, [onDone, durationMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-1/2 left-1/2 z-[60] flex w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 items-start gap-3 rounded-lg bg-gray-900 px-4 py-3 text-left text-sm text-white shadow-lg"
    >
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={onDone}
        aria-label="Dismiss"
        className="shrink-0 border-0 bg-transparent p-0 leading-none text-gray-300 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
