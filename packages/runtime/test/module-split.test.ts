import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { applyDomJournalEntries } from '../src/dom-journal.ts';
import { createDomUpdateEntry } from '../src/dom-update.ts';
import {
	createEventOnlyResumeContainerFromPayloads,
	resumeEventOnlyFromPayloadDocument,
} from '../src/event-only-resume.ts';
import { resumeEventFromPayloadDocument } from '../src/event-resume.ts';
import { createRuntimeGraph } from '../src/graph.ts';
import { decodePayloadScripts } from '../src/payload.ts';
import { render } from '../src/render.ts';
import { renderToString } from '../src/render-to-string.ts';
import { createResumeRuntime } from '../src/resume.ts';

function readSource(relativePath: string): Promise<string> {
	return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

async function readJson<T>(relativePath: string): Promise<T> {
	return JSON.parse(await readSource(relativePath)) as T;
}

test('runtime split modules expose graph, payload, event resume, render, DOM update, DOM journal, and resume boundaries', () => {
	expect(typeof applyDomJournalEntries).toBe('function');
	expect(typeof createDomUpdateEntry).toBe('function');
	expect(typeof createEventOnlyResumeContainerFromPayloads).toBe('function');
	expect(typeof resumeEventOnlyFromPayloadDocument).toBe('function');
	expect(typeof resumeEventFromPayloadDocument).toBe('function');
	expect(typeof createRuntimeGraph).toBe('function');
	expect(typeof decodePayloadScripts).toBe('function');
	expect(typeof render).toBe('function');
	expect(typeof renderToString).toBe('function');
	expect(typeof createResumeRuntime).toBe('function');
});

test('runtime package export map points public subpaths at their split modules', async () => {
	const manifest = await readJson<{ exports: Record<string, string> }>('../package.json');

	expect(manifest.exports['./render-to-string']).toBe('./src/render-to-string.ts');
	expect(manifest.exports['./resume']).toBe('./src/payload.ts');
});

test('render entry does not statically import event-only resume fallback code', async () => {
	const renderSource = await readSource('../src/render.ts');

	expect(renderSource).not.toMatch(
		/import\s*\{[\s\S]*createEventOnlyResumeContainerFromPayloads[\s\S]*\}\s*from\s+['"]\.\/event-only-resume\.ts['"]/,
	);
	expect(renderSource).toMatch(/import\(\s*['"]\.\/render-csr\.ts['"]\s*\)/);
	expect(renderSource).not.toMatch(/import\(\s*['"]\.\/event-only-resume\.ts['"]\s*\)/);
	expect(renderSource).not.toMatch(/import\(\s*['"]\.\/resume\.ts['"]\s*\)/);
	expect(renderSource).not.toMatch(/import\(\s*['"]\.\/payload\.ts['"]\s*\)/);
	expect(renderSource).not.toMatch(/import\(\s*['"]\.\/graph\.ts['"]\s*\)/);
});
