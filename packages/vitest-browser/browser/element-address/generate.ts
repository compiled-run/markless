import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { elementAddressCorpus } from './corpus.ts';

// Vitest global setup: the corpus is written once, before the browser loads anything, so no file appears mid-run.
export default function generateElementAddressCorpus(): void {
	const directory = join(dirname(fileURLToPath(import.meta.url)), 'generated');
	const corpus = elementAddressCorpus();
	const manifest = JSON.stringify(
		corpus.map(({ source: _source, ...template }) => ({
			...template,
			path: join(directory, `${template.name}.tsrx`),
		})),
		null,
		'\t',
	);
	const written = (() => {
		try {
			return readFileSync(join(directory, 'manifest.json'), 'utf8');
		} catch {
			return undefined;
		}
	})();
	if (written === manifest) return;
	rmSync(directory, { recursive: true, force: true });
	mkdirSync(directory, { recursive: true });
	for (const template of corpus)
		writeFileSync(join(directory, `${template.name}.tsrx`), template.source);
	writeFileSync(join(directory, 'manifest.json'), manifest);
}
