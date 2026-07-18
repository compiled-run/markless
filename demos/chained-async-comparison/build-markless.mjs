import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBuilder } from 'vite';

const root = fileURLToPath(new URL('./markless', import.meta.url));
const builder = await createBuilder({
	root,
	configFile: path.join(root, 'vite.config.mjs'),
	mode: 'production',
});
await builder.buildApp();
