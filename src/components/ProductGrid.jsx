// A plain grid of product cards with live prices and availability (home page rows, related products).
import { useEffect } from 'preact/hooks';
import ProductCard from './ProductCard.jsx';
import { feed, loadFeed, useSignal } from '../client/store.js';

export default function ProductGrid({ products, settings, scroll = false }) {
  const f = useSignal(feed);
  useEffect(() => {
    loadFeed();
  }, []);
  const s = f?.settings ? { ...settings, ...f.settings } : settings;
  if (scroll) {
    return (
      <ul class="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2" role="list">
        {products.map((p) => (
          <li key={p.slug} class="w-[44vw] max-w-[220px] shrink-0 snap-start sm:w-[220px]">
            <ProductCard p={p} f={f} settings={s} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" role="list">
      {products.map((p) => (
        <li key={p.slug}>
          <ProductCard p={p} f={f} settings={s} />
        </li>
      ))}
    </ul>
  );
}
