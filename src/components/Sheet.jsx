// Slide-in panel (cart drawer, mobile menu). Rendered on <body>: the sticky header's
// backdrop blur would otherwise trap a fixed panel inside the header.
import { useEffect, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';

export default function Sheet({ open, onClose, side = 'right', title, label = title, children }) {
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector('[data-close]')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panel.current) {
        // Keep keyboard focus inside the panel while it is open.
        const els = panel.current.querySelectorAll('a[href],button:not([disabled]),select,input');
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      if (prev instanceof HTMLElement) prev.focus();
    };
  }, [open]);

  if (!open) return null;
  const left = side === 'left';
  return createPortal(
    <div class="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label}>
      <div class="sheet-fade absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        ref={panel}
        class={`absolute inset-y-0 flex flex-col border-line bg-ink shadow-2xl ${left ? 'sheet-left left-0 w-[85%] max-w-sm border-r' : 'sheet-right right-0 w-full max-w-md border-l'}`}
      >
        <div class="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 class="display text-xl">{title}</h2>
          <button type="button" data-close class="inline-flex size-11 items-center justify-center rounded-lg hover:bg-surface-2" onClick={onClose} aria-label={`Close ${label.toLowerCase()}`}>
            <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
