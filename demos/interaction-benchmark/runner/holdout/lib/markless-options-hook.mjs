// Node module hook: merges HOLDOUT_MARKLESS_OPTIONS (JSON) into every markless() call, so a holdout app
// builds with experimental options without editing its vite config. Loaded with `node --import`.
import { register } from 'node:module';

const options = process.env.HOLDOUT_MARKLESS_OPTIONS;
if (options) register('./markless-options-loader.mjs', import.meta.url, { data: { options } });
