import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { extractApiManifest, manifestJson } from './extract.ts';

const REGENERATE = 'run `pnpm --dir packages/headless/components api:extract`';

test('the checked-in api/manifest.json matches what the sources say', () => {
	const checkedIn = readFileSync(new URL('../api/manifest.json', import.meta.url), 'utf8');
	const derived = manifestJson();

	expect(
		derived,
		`api/manifest.json is stale against packages/headless/components/src: ${REGENERATE}`,
	).toBe(checkedIn);
});

test('every family folder reaches the manifest with at least one part', () => {
	const manifest = extractApiManifest();
	const empty = Object.keys(manifest).filter((family) => manifest[family]?.parts.length === 0);

	expect(empty, `families extracted with no parts, so the walk lost them: ${REGENERATE}`).toEqual(
		[],
	);
});

test('family keys are alphabetical, so a manifest diff stays readable', () => {
	const families = Object.keys(extractApiManifest());

	expect(families).toEqual([...families].sort());
});
