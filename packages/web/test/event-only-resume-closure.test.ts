import { readFileSync } from 'node:fs';
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
const sourceByteLimit = 28892;

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
		'resume-async-wiring.ts',
		'resume-csr-coordinate.ts',
		'fns/ssr.ts',
	]) {
		const source = readFileSync(join(repoRoot, 'packages/web/src', file), 'utf8');
		expect(source).toMatch(/satisfies Record<keyof [^,>]+(?:\['armRecords'\])?, true>/);
	}
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
