import { expect, test } from 'vitest';

// The permanent fleet gate: coverage of the multi-embed conformance battery
// cannot silently regress. Every family registered in src/index.ts either
// invokes runMultiEmbedConformance from its own colocated suite, or is named in
// ALLOWLIST below with the wave that will cover it.
//
// ALLOWLIST MODE, on purpose and temporarily. The list is the honest statement
// of what the waves have not reached yet, and it can only shrink: a family that
// is neither covered nor allowlisted fails, AND an allowlisted family that IS
// covered also fails, so a wave cannot land coverage without deleting its
// entry. A stale entry naming a family that no longer exists fails too.
//
// At the final audit this flips strict: delete the ALLOWLIST literal and the
// two rows that read it, leaving "every registered family is covered". The
// new-family checklist in SPEC.md carries the same requirement, so a family
// added after the flip arrives with its pins.

// Families still owed multi-embed conformance pins. Shrink this as waves land;
// never grow it without a ruling.
const ALLOWLIST: readonly string[] = [
	'calendar',
	'carousel',
	'colorpicker',
	'crop',
	'datebox',
	'fileupload',
	'ink',
	'otp',
	'pad',
	'resizable',
	'slider',
	'taglist',
	'textbox',
	'timebox',
];

// The registered family list, read from the package's own export surface rather
// than from a directory listing: a folder that src/index.ts does not export is
// not a shipped family, and the export list is what CATALOG.md documents.
const familyIndexSource = Object.values(
	import.meta.glob('../src/index.ts', { query: '?raw', import: 'default', eager: true }),
)[0] as string | undefined;

// Colocated per family, per the wave plan: test-support/ holds the shared
// battery, and each family's invocation lives in its own src/<family>/ folder
// beside the scenario it mounts. Globbing only that shape means this file
// cannot match itself.
const familySuiteSources = import.meta.glob('../src/*/*.browser.ts', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>;

const BATTERY_IMPORT = /from\s+['"][^'"]*multi-embed-conformance(?:\.ts)?['"]/;
const BATTERY_CALL = /\brunMultiEmbedConformance\s*\(/;

function registeredFamilies(): string[] {
	if (!familyIndexSource) throw new Error('Could not read src/index.ts to list the families.');
	const dirs = [...familyIndexSource.matchAll(/from\s+'\.\/([^/']+)\/index\.ts'/g)].map(
		(match) => match[1]!,
	);
	if (dirs.length === 0) throw new Error('src/index.ts exported no families; the parse is stale.');
	return [...new Set(dirs)].sort();
}

function coveredFamilies(): string[] {
	const covered = new Set<string>();
	for (const [path, source] of Object.entries(familySuiteSources)) {
		if (!BATTERY_IMPORT.test(source) || !BATTERY_CALL.test(source)) continue;
		const family = path.match(/\/src\/([^/]+)\//)?.[1];
		if (family) covered.add(family);
	}
	return [...covered].sort();
}

test('every registered family is covered by the multi-embed battery or allowlisted', () => {
	const uncovered = registeredFamilies().filter(
		(family) => !coveredFamilies().includes(family) && !ALLOWLIST.includes(family),
	);

	expect(
		uncovered,
		'These families have no multi-embed conformance invocation and are not allowlisted. ' +
			'Add runMultiEmbedConformance to src/<family>/<family>.browser.ts, or allowlist them ' +
			'with the wave that will cover them.',
	).toEqual([]);
});

// The half that forces the list to shrink truthfully: coverage landing without
// the allowlist entry coming out would otherwise leave a permanent lie behind.
test('no allowlisted family is already covered', () => {
	const covered = coveredFamilies();
	const stale = ALLOWLIST.filter((family) => covered.includes(family));

	expect(
		stale,
		'These families now invoke the multi-embed battery. Delete them from ALLOWLIST.',
	).toEqual([]);
});

test('the allowlist names only registered families', () => {
	const registered = registeredFamilies();
	const unknown = ALLOWLIST.filter((family) => !registered.includes(family));

	expect(
		unknown,
		'These allowlist entries are not exported from src/index.ts. Delete or rename them.',
	).toEqual([]);
});
