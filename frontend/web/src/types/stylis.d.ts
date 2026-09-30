// stylis ships JS only (no bundled types); it is consumed indirectly via
// @emotion/cache's `stylisPlugins` in src/i18n/rtlCaches.ts.
declare module 'stylis' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const prefixer: any;
}
