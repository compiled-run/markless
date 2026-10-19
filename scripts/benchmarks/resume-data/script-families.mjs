// Splits downloaded chunk bytes into module families from the build's byte-attribution.json.
// A chunk's bytes are shared out in proportion to each module's rendered length (pre-minification).
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export const SCRIPT_FAMILIES = {
	'handler code': (kind, id) =>
		kind === 'author' && /^virtual:markless:symbol:.*:symbol:[^:]+$/.test(id),
	'handler lookup tables': (kind, id) =>
		/^virtual:markless:resolver:|\?markless-symbols$/.test(id),
	'handler startup wrappers': (_kind, id) => /^virtual:markless:symbol:.*:entry$/.test(id),
	'render data': (_kind, id) => id.startsWith('virtual:markless:render-data:'),
	runtime: (kind) => kind === 'runtime',
	glue: (kind) => kind === 'glue',
	'app modules': (kind) => kind === 'author',
	'third-party': () => true,
};

export function scriptFamilies(appDir, perFile) {
	const file = [
		'.output/.markless/public/byte-attribution.json',
		'.markless/dist/byte-attribution.json',
	]
		.map((relative) => join(appDir, relative))
		.find((candidate) => existsSync(candidate));
	if (!file) return undefined;
	const { chunks } = JSON.parse(readFileSync(file, 'utf8'));
	const out = Object.fromEntries(Object.keys(SCRIPT_FAMILIES).map((name) => [name, 0]));
	let unattributed = 0;
	for (const [path, bytes] of Object.entries(perFile)) {
		const chunk = chunks[basename(path)];
		if (!chunk) {
			unattributed += bytes;
			continue;
		}
		const rendered = chunk.modules.reduce((total, [, , length]) => total + length, 0);
		for (const [kind, id, length] of chunk.modules) {
			const family = Object.entries(SCRIPT_FAMILIES).find(([, test]) => test(kind, id))[0];
			out[family] += rendered ? (length / rendered) * bytes : 0;
		}
	}
	for (const name of Object.keys(out)) out[name] = Math.round(out[name]);
	return { ...out, 'outside the build (inline, router links, public files)': unattributed };
}
