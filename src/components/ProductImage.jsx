// Product photo, or a drawn tub with the brand's initials until the owner adds one.
import { asset } from '../lib/env.js';

export function initials(brand) {
  const words = String(brand || '').replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s-]+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join('').slice(0, 3).toUpperCase();
}

export default function ProductImage({ src, brand, name, size = '', eager = false, class: cls = '' }) {
  const alt = [brand, name, size].filter(Boolean).join(' ');
  if (src) {
    return (
      <img
        src={asset(src)}
        alt={alt}
        width="600"
        height="600"
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        fetchpriority={eager ? 'high' : undefined}
        class={`aspect-square w-full object-contain ${cls}`}
      />
    );
  }
  const ini = initials(brand);
  return (
    <svg viewBox="0 0 300 300" role="img" aria-label={`${alt} – photo coming soon`} class={`aspect-square w-full ${cls}`}>
      <rect width="300" height="300" fill="#181818" />
      <ellipse cx="150" cy="252" rx="78" ry="10" fill="#000" opacity="0.5" />
      <rect x="82" y="58" width="136" height="28" rx="8" fill="#c6ff00" />
      <rect x="88" y="80" width="124" height="170" rx="16" fill="#262626" />
      <rect x="88" y="122" width="124" height="80" fill="#0d0d0d" />
      <text x="150" y="170" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size={ini.length > 2 ? 34 : 42} fill="#c6ff00">
        {ini}
      </text>
      <text x="150" y="192" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="11" fill="#a6a6a1" letter-spacing="1">
        {String(size || '').toUpperCase()}
      </text>
    </svg>
  );
}
