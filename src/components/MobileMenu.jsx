// Hamburger button + left-hand menu sheet for phones and tablets.
// All hrefs arrive ready-made from Header.astro (they already include the site's sub-folder).
import { useState } from 'preact/hooks';
import Sheet from './Sheet.jsx';

export default function MobileMenu({ categories, pages, current, telHref, phoneDisplay, waHref }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const here = (href) => (current === href ? 'page' : undefined);

  return (
    <>
      <button
        type="button"
        class="inline-flex size-11 items-center justify-center rounded-lg hover:bg-surface-2 lg:hidden"
        aria-label="Menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <Sheet open={open} onClose={close} side="left" title="Menu">
        <nav class="flex-1 overflow-y-auto px-4 py-5" aria-label="Menu">
          <p class="mb-2 text-xs font-black uppercase tracking-wider text-muted">Shop</p>
          <ul class="mb-6 grid grid-cols-2 gap-2">
            {categories.map((c) => (
              <li>
                <a
                  href={c.href}
                  aria-current={here(c.href)}
                  class="card flex min-h-12 items-center px-3 py-2 text-sm font-bold aria-[current=page]:border-lime aria-[current=page]:text-lime"
                >
                  {c.name}
                </a>
              </li>
            ))}
          </ul>
          <ul class="space-y-1 border-t border-line pt-4 text-base font-bold">
            {pages.map((p) => (
              <li>
                <a href={p.href} aria-current={here(p.href)} class="block rounded-lg px-2 py-2.5 hover:bg-surface-2 aria-[current=page]:text-lime">
                  {p.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div class="grid grid-cols-2 gap-2 border-t border-line p-4">
          <a class="btn btn-ghost text-sm" href={telHref} aria-label={`Call the shop, ${phoneDisplay}`}>
            Call the shop
          </a>
          <a class="btn btn-lime text-sm" href={waHref} target="_blank" rel="noopener">
            WhatsApp us
          </a>
        </div>
      </Sheet>
    </>
  );
}
