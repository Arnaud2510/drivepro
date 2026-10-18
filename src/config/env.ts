/**
 * Preview build (`npm run build:preview`): a static beta that runs inside an embedded preview
 * host. No backend, no URL routing, and the host blocks printing and file downloads.
 */
export const IS_PREVIEW = import.meta.env.VITE_PREVIEW === '1';
