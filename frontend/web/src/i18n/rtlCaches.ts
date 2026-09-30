import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';

export const ltrCache = createCache({ key: 'mui', stylisPlugins: [] });
export const rtlCache = createCache({ key: 'muirtl', stylisPlugins: [prefixer, rtlPlugin as never] });
