// Small "Added to cart" notice at the bottom of the screen, with a "View cart" button.
// Lives in the page body (not the header), so its fixed position is not trapped by the header blur.
import { cartOpen, toast, useSignal } from '../client/store.js';

export default function Toast() {
  const t = useSignal(toast);
  // The live region is always present so screen readers announce each new notice.
  return (
    <div class="toast pointer-events-none fixed left-4 right-20 z-40 sm:left-1/2 sm:right-auto sm:w-96 sm:-translate-x-1/2" role="status" aria-live="polite">
      {t && (
        <div key={t.id} class="toast-in card pointer-events-auto flex items-center gap-3 border-lime/40 bg-surface-2 p-3 shadow-2xl shadow-black/60">
          <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-lime text-ink" aria-hidden="true">
            <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <path d="m5 12 5 5 9-10" />
            </svg>
          </span>
          <p class="min-w-0 flex-1 text-sm leading-tight">
            <span class="block font-bold">Added to cart</span>
            <span class="line-clamp-2 text-xs text-muted">{t.text}</span>
          </p>
          <button
            type="button"
            class="shrink-0 rounded-lg bg-lime px-3 py-2 text-sm font-black text-ink"
            onClick={() => {
              toast.set(null);
              cartOpen.set(true);
            }}
          >
            View cart
          </button>
        </div>
      )}
    </div>
  );
}
