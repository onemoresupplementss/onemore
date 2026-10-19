// Product photo gallery: the picked size/flavour's own photo first, then label photos
// (LabelImages in the sheet), then a "What's inside" card made from the product details.
// Swipe on phones, thumbnails underneath, hover to zoom on laptops, tap a photo to open it full screen.
import { useEffect, useRef, useState } from 'preact/hooks';
import ProductImage from './ProductImage.jsx';
import { selectedVariant, useSignal } from '../client/store.js';
import { asset } from '../lib/env.js';

export default function ProductPhoto({ variants, image, brand, name, labels = [], facts = null }) {
  const id = useSignal(selectedVariant);
  const v = variants.find((x) => x.id === id) || variants[0];
  const main = v.image || image;
  const slides = [{ kind: 'photo', src: main }, ...labels.map((src) => ({ kind: 'photo', src, label: true }))];
  if (facts) slides.push({ kind: 'facts' });
  const [at, setAt] = useState(0);
  const [open, setOpen] = useState(null);
  const track = useRef();

  function go(i) {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
    setAt(i);
  }
  // A new size or flavour brings its photo back to the front.
  useEffect(() => go(0), [main]);
  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === 'Escape' && setOpen(null);
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [open]);

  function zoom(e) {
    const img = e.currentTarget.querySelector('img');
    if (!img || !matchMedia('(hover: hover)').matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
    img.style.transform = 'scale(2)';
  }
  function unzoom(e) {
    const img = e.currentTarget.querySelector('img');
    if (img) img.style.transform = '';
  }

  return (
    <div>
      <div class="card relative overflow-hidden">
        <div
          ref={track}
          class="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
          onScroll={(e) => setAt(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        >
          {slides.map((s, i) => (
            <div class="relative w-full shrink-0 snap-center" key={i}>
              {s.kind === 'photo' ? (
                <button
                  type="button"
                  class="block w-full cursor-zoom-in overflow-hidden bg-white"
                  onMouseMove={zoom}
                  onMouseLeave={unzoom}
                  onClick={() => setOpen(s.src)}
                  aria-label="Open photo full screen"
                >
                  <ProductImage src={s.src} brand={brand} name={s.label ? `${name} label` : name} size={v.size} eager={i === 0} class="transition-transform duration-150" />
                </button>
              ) : (
                <Facts facts={facts} />
              )}
            </div>
          ))}
        </div>
        {slides.length > 1 && (
          <>
            {/* Dots: show there are more pictures and which one is on screen. */}
            <div class="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
              <div class="pointer-events-auto flex items-center gap-1.5 rounded-full bg-ink/70 px-2.5 py-1.5 backdrop-blur">
                {slides.map((_, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => go(i)}
                    aria-label={`Show picture ${i + 1} of ${slides.length}`}
                    class={`h-2 rounded-full transition-all duration-200 ${at === i ? 'w-6 bg-lime' : 'w-2 bg-white/50 hover:bg-white/80'}`}
                  />
                ))}
              </div>
            </div>
            {/* Arrows on laptops; phones swipe. */}
            {at > 0 && (
              <button type="button" onClick={() => go(at - 1)} aria-label="Previous picture" class="absolute left-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink/70 text-2xl font-bold text-white backdrop-blur hover:bg-ink sm:flex">
                ‹
              </button>
            )}
            {at < slides.length - 1 && (
              <button type="button" onClick={() => go(at + 1)} aria-label="Next picture" class="absolute right-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink/70 text-2xl font-bold text-white backdrop-blur hover:bg-ink sm:flex">
                ›
              </button>
            )}
          </>
        )}
      </div>
      {slides.length > 1 && (
        <div class="mt-3 flex gap-2">
          {slides.map((s, i) => (
            <button
              type="button"
              key={i}
              onClick={() => go(i)}
              aria-label={s.kind === 'facts' ? "What's inside" : `Photo ${i + 1}`}
              aria-current={at === i}
              class={`size-16 overflow-hidden rounded-lg border-2 sm:size-20 ${at === i ? 'border-lime' : 'border-line opacity-70 hover:opacity-100'}`}
            >
              {s.kind === 'photo' ? (
                <img src={asset(s.src)} alt="" loading="lazy" class="size-full bg-white object-contain" />
              ) : (
                <span class="flex size-full flex-col items-center justify-center bg-surface-2 text-[0.6rem] font-black uppercase leading-tight text-lime">
                  <span class="text-lg">🔍</span>Inside
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {open && (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setOpen(null)} role="dialog" aria-label="Photo">
          <img src={asset(open)} alt={`${brand} ${name}`} class="max-h-full max-w-full rounded-lg bg-white object-contain" />
          <button type="button" class="absolute right-4 top-4 size-11 rounded-full bg-surface text-2xl font-bold" aria-label="Close">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function Facts({ facts }) {
  return (
    <div class="flex aspect-square w-full flex-col overflow-hidden bg-[radial-gradient(circle_at_30%_0%,#2a3a05,#0a0a0a_65%)] p-5 sm:p-8">
      <p class="text-xs font-black uppercase tracking-[0.2em] text-lime">What's inside</p>
      {facts.title && <p class="mt-1 text-sm text-muted">{facts.title}</p>}
      {facts.tiles?.length > 0 && (
        <div class="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
          {facts.tiles.map((t) => (
            <div class="rounded-xl border border-line bg-ink/70 px-3 py-2.5 sm:py-3.5">
              <p class="text-xl font-black leading-none text-lime sm:text-3xl">{t.value}</p>
              <p class="mt-1 text-xs font-semibold capitalize text-fg sm:text-sm">{t.label}</p>
            </div>
          ))}
        </div>
      )}
      {facts.ingredients && (
        <div class="mt-4 min-h-0 flex-1 overflow-hidden">
          <p class="text-xs font-black uppercase tracking-wider text-muted">Ingredients</p>
          <p class="mt-1 line-clamp-3 text-sm leading-relaxed text-fg/90 sm:line-clamp-[8]">{facts.ingredients}</p>
        </div>
      )}
    </div>
  );
}
