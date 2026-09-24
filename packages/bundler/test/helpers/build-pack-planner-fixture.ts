// Builds the vite-ssr counter fixture with native packing and the closure pack planner on.
import { resolve } from 'pathe';
import { createBuilder } from 'vite';
import { markless } from '../../src/vite/index.ts';

const [outDir] = process.argv.slice(2);
if (!outDir) throw new Error('usage: <outDir>');
const fixture = resolve(import.meta.dirname, '../../fixtures/vite-ssr');

const builder = await createBuilder({
	configFile: false,
	root: fixture,
	logLevel: 'error',
	build: {
		outDir,
		emptyOutDir: true,
		rolldownOptions: { input: 'index.html', preserveEntrySignatures: 'exports-only' },
	},
	environments: {
		ssr: {
			build: {
				outDir: resolve(outDir, 'server'),
				rolldownOptions: { input: resolve(fixture, 'src/root.tsrx') },
			},
		},
	},
	plugins: [markless({ experimentalNativePacking: true, experimentalPackPlanner: 'closures' })],
});
await builder.buildApp();
