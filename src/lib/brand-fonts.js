// Look-alike typefaces for the home page brand ticker. Real logo lettering is custom
// and not for sale, so each brand gets the closest free Google Font (SIL OFL), matched
// by eye to the wordmark on its pack. Only the letters of the name are downloaded
// (a few KB per brand): after adding a brand here, run `npm run brand-fonts`.
// A brand in shop.config.json "brandStrip" without an entry here uses the site's display font.
//
// family/axes: the Google Fonts css2 request, e.g. "Saira" + "ital,wdth,wght@1,125,800".
// upper: show the name in capitals, like the logo. text: exact logo spelling (ATOM's "Λ").
// size: scale against the other names so they read the same size. tracking: letter-spacing.
export const BRAND_FONTS = {
  'Optimum Nutrition': { family: 'Roboto Condensed', axes: 'wght@700', upper: true, size: 1 },
  MuscleBlaze: { family: 'Barlow', axes: 'wght@800', upper: true, size: 0.98 },
  MuscleTech: { family: 'Saira', axes: 'ital,wdth,wght@1,125,800', upper: true, size: 0.9 },
  Myprotein: { family: 'Montserrat', axes: 'wght@700', upper: true, size: 0.8, tracking: '0.14em' },
  GNC: { family: 'Exo 2', axes: 'ital,wght@1,900', upper: true, size: 1.12 },
  Labrada: { family: 'Barlow Condensed', axes: 'ital,wght@1,800', upper: true, size: 1.18 },
  BSN: { family: 'Russo One', upper: true, size: 1, tracking: '0.12em' },
  'Kevin Levrone': { family: 'Poppins', axes: 'wght@800', upper: true, size: 0.88 },
  'Ronnie Coleman': { family: 'Kanit', axes: 'ital,wght@1,800', upper: true, size: 0.95 },
  Atom: { family: 'Manrope', axes: 'wght@800', text: 'ΛTOM', size: 1.05, tracking: '0.06em' },
  Wellcore: { family: 'Archivo', axes: 'wdth,wght@125,900', upper: true, size: 0.86 },
  'One Science': { family: 'Jost', axes: 'wght@500', upper: true, size: 0.82, tracking: '0.14em' },
};

export function brandSlug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** What the ticker shows for a brand: the logo spelling, in capitals where the logo is. */
export function brandDisplay(name) {
  const f = BRAND_FONTS[name];
  if (!f) return name;
  return f.text || (f.upper ? name.toUpperCase() : name);
}

/** Path (under public/) of a brand's subset font file. */
export function brandFontFile(name) {
  return `fonts/brands/${brandSlug(name)}.woff2`;
}
