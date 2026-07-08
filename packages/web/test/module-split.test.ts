import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { applyDomJournalEntries } from '../src/dom-journal.ts';
import { createDomUpdateEntry } from '../src/dom-update.ts';
import { resumeEventOnlyFromPayloadDocument } from '../src/event-only-resume.ts';
import { resumeEventFromPayloadDocument } from '../src/event-resume.ts';
import { decodePayloadScripts } from '../src/payload.ts';
import { render } from '../src/render.ts';
import { renderToString } from '../src/render-to-string.ts';
import { createResumeRuntime } from '../src/resume.ts';

function readSource(relativePath: string): Promise<string> {
	return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

test('web package owns DOM render, resume, payload, and journal modules', () => {
	expect(typeof applyDomJournalEntries).toBe('function');
	expect(typeof createDomUpdateEntry).toBe('function');
	expect(typeof resumeEventOnlyFromPayloadDocument).toBe('function');
	expect(typeof resumeEventFromPayloadDocument).toBe('function');
	expect(typeof decodePayloadScripts).toBe('function');
	expect(typeof render).toBe('function');
	expect(typeof renderToString).toBe('function');
	expect(typeof createResumeRuntime).toBe('function');
});

test('web render entry does not statically import event-only resume fallback code', async () => {
	const renderSource = await readSource('../src/render.ts');
	const renderCsrSource = await readSource('../src/render-csr.ts');

	expect(renderSource).not.toMatch(
		/import\s*\{[\s\S]*createEventOnlyResumeContainerFromPayloads[\s\S]*\}\s*from\s+['"]\.\/event-only-resume\.ts['"]/,
	);
	expect(renderSource).toMatch(/import\(\s*['"]\.\/render-csr\.ts['"]\s*\)/);
	expect(renderSource).not.toMatch(/import\(\s*['"]\.\/event-only-resume\.ts['"]\s*\)/);
	expect(renderSource).not.toMatch(/import\(\s*['"]\.\/resume\.ts['"]\s*\)/);
	expect(renderSource).not.toMatch(/import\(\s*['"]\.\/payload\.ts['"]\s*\)/);
	expect(renderCsrSource).toContain("import(\n\t\t\t'./payload-graph-construct.ts'");
	expect(renderCsrSource).not.toContain("import('./payload-full.ts')");
});

test('full resume avoids the server value decoder in browser chunks', async () => {
	const payloadSource = await readSource('../src/payload-full.ts');
	const graphSource = await readSource('../src/payload-graph-construct.ts');
	const repeatSource = await readSource('../src/repeat-runtime.ts');

	// T115: static edge — the demand map co-demands graph construction with
	// payload-full on every tier that loads it; chunk groups keep them split.
	expect(payloadSource).toContain("from './payload-graph-construct.ts'");
	expect(payloadSource).not.toContain("import('../../serializer/src/value-decode-client.ts')");
	expect(graphSource).toContain("import('../../serializer/src/value-decode-client.ts')");
	expect(repeatSource).toContain("@markless/serializer/decode-client");
	expect(payloadSource).not.toContain("@markless/serializer/decode'");
	expect(repeatSource).not.toContain("@markless/serializer/decode'");
});

test('payload-full keeps heavy resume dependencies behind dynamic gates', async () => {
	const payloadSource = await readSource('../src/payload-full.ts');
	const runtimeImports = [...payloadSource.matchAll(/^import[\s\S]*?;\n/gm)]
		.map((match) => match[0])
		.filter((statement) => !statement.startsWith('import type '));

	for (const specifier of [
		'@markless/serializer/decode-client',
		'@markless/serializer/protocol-validation',
		'@markless/runtime',
		'./dom-journal.ts',
		'./inline/payload-document.ts',
		'./resume.ts',
	]) {
		expect(runtimeImports).not.toContainEqual(
			expect.stringContaining(`from '${specifier}'`),
		);
	}
});

test('payload graph construction stays isolated in its own module', async () => {
	const payloadSource = await readSource('../src/payload-full.ts');
	const graphSource = await readSource('../src/payload-graph-construct.ts');

	// T115: graph construction is a static re-export (always co-demanded), but
	// its implementation and the runtime graph import stay out of payload-full.
	expect(payloadSource).toContain("from './payload-graph-construct.ts'");
	expect(payloadSource).not.toContain("from '@markless/runtime'");
	expect(payloadSource).not.toContain('asyncRunnerSymbolsByGraphNode');
	expect(graphSource).toContain('createRuntimeGraphFromResumePayload');
	expect(graphSource).toContain('asyncRunnerSymbolsByGraphNode');
});

test('resume runtime split points keep capability code in separate modules', async () => {
	const runtimeSource = await readSource('../src/resume-runtime.ts');
	const runtimeSharedSource = await readSource('../src/resume-runtime-shared.ts');
	const asyncWiringSource = await readSource('../src/resume-async-wiring.ts');
	const sharedPatchSource = await readSource('../src/resume-shared-patch.ts');
	const syncDemandSource = await readSource('../src/resume-sync-demand.ts');

	// T007j moved startup wiring into resume-runtime-start.ts; the dynamic
	// boundary lives there now.
	const runtimeStartSource = await readSource('../src/resume-runtime-start.ts');
	expect(runtimeStartSource).toContain("import('./resume-async-wiring.ts')");
	expect(runtimeSource).toContain("import('./resume-runtime-shared.ts')");
	expect(runtimeSharedSource).toContain("import('./resume-shared-patch.ts')");
	expect(runtimeStartSource).toContain("import('./resume-sync-demand.ts')");
	expect(runtimeSource).not.toContain('function wireAsyncBoundariesWithoutLoadingCapability');
	expect(runtimeSource).not.toContain('function receiveSharedPatch');
	expect(runtimeSharedSource).toContain('receiveSharedPatch');
	expect(runtimeSource).not.toContain('function wireSyncComputedDemandTriggersWithoutLoadingCapability');
	expect(asyncWiringSource).toContain('settleAsyncBoundaryRange');
	expect(sharedPatchSource).toContain('receiveSharedPatch');
	expect(syncDemandSource).toContain('wireSyncComputedDemandTriggersWithoutLoadingCapability');
});

test('lean scalar core does not import row or full payload-document code', async () => {
	const scalarCoreSource = await readSource('../src/event-only-lean/scalar-core.ts');
	const leanSharedSource = await readSource('../src/event-only-lean/lean-shared.ts');
	const rowSource = await readSource('../src/event-only-lean/row.ts');

	expect(scalarCoreSource).not.toContain("import('./payload-records.ts')");
	expect(scalarCoreSource).not.toContain('readScalarCorePayloadRecordsFromDocument');
	expect(scalarCoreSource).not.toContain('resume-keyed-repeats');
	expect(scalarCoreSource).not.toContain('payload-document');
	expect(scalarCoreSource).not.toContain('protocol-validation');
	expect(leanSharedSource).not.toContain('protocol-validation');
	expect(rowSource).toContain('resume-keyed-repeats');
	expect(rowSource).not.toContain('readRowPayloadRecordsFromDocument');
	expect(rowSource).not.toContain("from './scalar-core.ts'");
});
