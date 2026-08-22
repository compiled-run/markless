import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const entry = join(repoRoot, 'packages/web/src/event-only-resume.ts');
const resumeEntry = join(repoRoot, 'packages/web/src/resume.ts');
const resumeRuntimeEntry = join(repoRoot, 'packages/web/src/resume-runtime.ts');
const payloadEntry = join(repoRoot, 'packages/web/src/payload.ts');
const renderCsrEntry = join(repoRoot, 'packages/web/src/render-csr.ts');
const resumeOnDemandEntries = [
	join(repoRoot, 'packages/web/src/resume-async-boundaries.ts'),
	join(repoRoot, 'packages/web/src/resume-behaviors.ts'),
	join(repoRoot, 'packages/web/src/resume-branches.ts'),
	join(repoRoot, 'packages/web/src/resume-keyed-repeats.ts'),
	join(repoRoot, 'packages/web/src/resume-sync-computed.ts'),
] as const;
// 4,800 gzip bytes * the observed ~6.02 raw:minified+gzip ratio leaves a
// 28,892 byte raw-source proxy budget for the full progressive runtime closure.
// Ratio re-observed 2026-08-02 after sanctioned prerender and one-core
// convergence work: the largest closure was 18,961 raw bytes and its esbuild
// bundle+minify output was 3,150 gzip bytes. The 4,800-byte gzip wall is unchanged.
// INTERIM 2026-08-21 (T067b), 28,892 -> 29,047: +155 raw bytes, the compile-time-
// impossible identity cost class. Per-iteration widget identity needs a keyed-row
// segment in the instance-path grammar, and the grammar lives in the serializer's
// protocol-constants, which the payload closure statically reaches. Measured by
// reverting the change: 28,892 raw with it out, 29,047 with it in (~26 gzip at the
// observed 6.02 ratio, so the 4,800 gzip wall still holds). Repayment owed by the
// bundler-diet goal.
// INTERIM 2026-08-22 (T074), 29,047 -> 29,097: +50 raw bytes for one optional
// TYPE member on the protocol's shared definition (`projectionIds`, the ids a
// part composition placed beside a widget root spells it under, which browser
// resume registers from the payload). It is a type-literal field: it erases at
// build, so the shipped closure gains nothing and this proxy is measuring source
// text alone. The field is documented at its writer in web's composition seam,
// which this closure does not reach. De-minimis auto-interim per proportionality
// order 2026-08-04.
// INTERIM 2026-08-22 (T075g), 29,097 -> 29,943: +876 raw chars of growth, less a
// -30 trim, for a +846 net. Attributed by revert-measurement, not assumption: the
// binding closure is `payload.ts`, and of its 8 files the only one T075g touched is
// the serializer's protocol.ts. Reverting protocol.ts to its pre-T075g content (the
// change adds no import line, so closure membership is unchanged) puts the closure
// back at exactly 29,097 -- the ratified anchor -- so the whole delta is that one
// file. What it added is `sharedSeeds`, one optional TYPE member on
// ProtocolStatePayload: the shared nodes a component seeds from its own props, plus
// the prop reads each seed follows so a composing parent's write re-runs it. Like
// the T074 field above it is type-literal and erases at build, so the shipped
// closure gains nothing and this proxy is measuring source text alone.
// Compile-time-impossible: a return-leg seed is decided when a parent composes a
// child, which is a runtime composition, so the payload has to carry the route.
// Repayment owed and NOT paid here: 12,015 of the closure's 29,943 chars are
// protocol.ts, and the only runtime value web pulls from it is
// PROTOCOL_EVENT_ACTION_KIND. Moving that one constant into protocol-constants.ts
// (already in the closure) drops protocol.ts from the closure entirely and buys
// back ~12,000 chars. That trim is serializer-side, outside this unit's contract.
// The -30 trim taken here is web-side: payload.ts named the same seven symbols
// twice, once to import and once to re-export, and the re-export now sources them
// directly. Measured 29,973 before the trim, 29,943 after.
// REPAYMENT 2026-08-22 (U106), 29,943 -> 20,996: the debt the T075g interim
// directly above owed is paid. PROTOCOL_EVENT_ACTION_KIND was the only runtime
// value this closure pulled out of the serializer's protocol.ts; its definition
// now lives in protocol-constants.ts, which the closure already reached.
// protocol.ts re-exports it, so every other consumer's path is unchanged, and
// protocol-client.ts's remaining protocol.ts bindings are types, which this
// walk erases. Cause of the drop: protocol.ts (11,959 chars) left the closure
// via that constant move, and async-boundary-arm.ts (271) left with it, taking
// the payload closure from 29,943 to 18,071. The new anchor is not payload.ts
// though: the largest closure this wall governs is now resume-runtime.ts at
// 20,996, a single-file closure this change does not touch. This is a measured
// value, not an estimate -- every governed entry was re-measured here.
const sourceByteLimit = 20996;

const forbiddenClosureFiles = [
	'packages/web/src/resume.ts',
	'packages/web/src/render.ts',
	'packages/web/src/render-csr.ts',
	'packages/web/src/render-to-string.ts',
	'packages/web/src/payload.ts',
	'packages/web/src/repeat-runtime.ts',
	'packages/serializer/src/index.ts',
	'packages/serializer/src/payload-scripts.ts',
] as const;

const forbiddenResumeSerializerFiles = [
	'packages/serializer/src/index.ts',
	'packages/serializer/src/payload-scripts.ts',
	'packages/serializer/src/protocol-state.ts',
	'packages/serializer/src/value.ts',
] as const;

test('event-only resume keeps its static source import closure lean', () => {
	const closure = collectStaticImportClosure(entry);
	const relativeClosure = closure.files.map((file) => toRepoPath(file)).sort();

	for (const forbidden of forbiddenClosureFiles) {
		expect(relativeClosure).not.toContain(forbidden);
	}
	expect(closure.sourceBytes).toBeLessThanOrEqual(sourceByteLimit);
});

test('payload resume keeps its static source import closure lean', () => {
	const closure = collectStaticImportClosure(payloadEntry);
	const relativeClosure = closure.files.map((file) => toRepoPath(file)).sort();

	expect(relativeClosure).not.toContain('packages/serializer/src/protocol-validation.ts');
	expect(relativeClosure).not.toContain('packages/serializer/src/value.ts');
	expect(closure.sourceBytes).toBeLessThanOrEqual(sourceByteLimit);
});

test('render-csr keeps full resume apply helpers out of its static import closure', () => {
	const closure = collectStaticImportClosure(renderCsrEntry);
	const relativeClosure = closure.files.map((file) => toRepoPath(file)).sort();
	const source = closure.files.map((file) => readFileSync(file, 'utf8')).join('\n');

	expect(relativeClosure).not.toContain('packages/web/src/resume.ts');
	expect(relativeClosure).not.toContain('packages/web/src/dom-journal.ts');
	expect(source).not.toContain('findRepeatItemByKey');
});

test.each([
	['full browser resume', resumeEntry],
	['payload resume', payloadEntry],
	['render-csr', renderCsrEntry],
])('%s does not statically reach serializer encode modules', (_name, startFile) => {
	const closure = collectStaticImportClosure(startFile);
	const relativeClosure = closure.files.map((file) => toRepoPath(file)).sort();

	for (const forbidden of forbiddenResumeSerializerFiles) {
		expect(relativeClosure).not.toContain(forbidden);
	}
});

test('resume core and on-demand runtime modules keep static source closures lean', () => {
	for (const entry of [resumeEntry, resumeRuntimeEntry, ...resumeOnDemandEntries]) {
		const closure = collectStaticImportClosure(entry);
		expect(closure.sourceBytes).toBeLessThanOrEqual(sourceByteLimit);
	}
});

test('every arm-record fold and prefix is compile-time exhaustive', () => {
	for (const file of [
		'resume-arm-records.ts',
		'resume-commit-arm.ts',
		// The composed prefix fold is pay-per-use: it lives in the instance-scope
		// module only composing pages load, not in the shared settle path.
		'fns/instance-scope.ts',
		'fns/ssr.ts',
	]) {
		const source = readFileSync(join(repoRoot, 'packages/web/src', file), 'utf8');
		expect(source).toMatch(/satisfies Record<keyof [^,>]+(?:\['armRecords'\])?, true>/);
	}
	expect(existsSync(join(repoRoot, 'packages/web/src/resume-csr-coordinate.ts'))).toBe(false);
});

function collectStaticImportClosure(startFile: string) {
	const seen = new Set<string>();
	const pending = [startFile];

	for (const file of pending) {
		if (seen.has(file)) continue;
		seen.add(file);

		const source = readFileSync(file, 'utf8');
		for (const specifier of staticRuntimeImportSpecifiers(source)) {
			const resolved = resolveImportSpecifier(file, specifier);
			if (resolved && !seen.has(resolved)) pending.push(resolved);
		}
	}

	let sourceBytes = 0;
	for (const file of seen) {
		sourceBytes += readFileSync(file, 'utf8').length;
	}

	return { files: [...seen], sourceBytes };
}

function staticRuntimeImportSpecifiers(source: string): string[] {
	const specifiers: string[] = [];
	const pattern =
		/\b(?:import|export)\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;
	for (const match of source.matchAll(pattern)) {
		const statement = match[0];
		if (!hasRuntimeImport(statement)) continue;
		specifiers.push(match[1] ?? match[2]!);
	}

	return specifiers;
}

function hasRuntimeImport(statement: string): boolean {
	const normalized = statement.replace(/\s+/g, ' ').trim();
	if (/^(import|export) type\b/.test(normalized)) return false;
	if (/^import ['"]/.test(normalized)) return true;
	if (normalized.startsWith('import * as ')) return true;
	if (/^import [^{]/.test(normalized)) return true;

	const bindings = /^(?:import|export) \{(?<bindings>.*)\} from /.exec(normalized)?.groups
		?.bindings;
	if (bindings === undefined) return true;

	return bindings
		.split(',')
		.map((binding) => binding.trim())
		.some((binding) => binding !== '' && !binding.startsWith('type '));
}

function resolveImportSpecifier(importer: string, specifier: string): string | undefined {
	if (specifier.startsWith('.')) {
		return resolveExistingSourceFile(resolve(dirname(importer), specifier));
	}

	if (specifier.startsWith('@markless/')) {
		return resolveWorkspaceExport(specifier);
	}

	return undefined;
}

function resolveWorkspaceExport(specifier: string): string | undefined {
	const [, packageName, ...subpathParts] = specifier.split('/');
	const packageRoot = join(repoRoot, 'packages', packageName!);
	const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
		readonly exports?: Record<string, string>;
	};
	const subpath = subpathParts.length === 0 ? '.' : `./${subpathParts.join('/')}`;
	const exportTarget = packageJson.exports?.[subpath];
	if (!exportTarget) return undefined;

	return resolveExistingSourceFile(join(packageRoot, exportTarget));
}

function resolveExistingSourceFile(file: string): string {
	const absolute = isAbsolute(file) ? file : resolve(file);
	if (absolute.endsWith('.ts')) return normalize(absolute);
	return normalize(`${absolute}.ts`);
}
function toRepoPath(file: string): string {
	return relative(repoRoot, file).split('/').join('/');
}
