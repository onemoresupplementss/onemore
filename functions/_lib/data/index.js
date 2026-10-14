// The one place that decides where orders and the catalogue live.
// To move to Cloudflare D1 later: write ./d1.js with the same createStore(env)
// shape and change the import below. Nothing else in the site has to change.
export { createStore } from './apps-script.js';
