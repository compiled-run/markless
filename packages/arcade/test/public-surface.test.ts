import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import {
	computed,
	element,
	render,
	renderToString,
	resumeFromPayloadDocument,
	resumeFromPayloadScripts,
	arcadeClient,
	shared,
	state,
} from '../src/index.ts';
import { Link } from '../src/router.ts';
import { router } from '../src/router/vite.ts';
import { applyDomJournalEntries as narrowApplyDomJournalEntries } from '../src/runtime/dom-journal.ts';
import { createDomUpdateEntry as createNarrowDomUpdateEntry } from '../src/runtime/dom-update.ts';
import { resumeEventOnlyFromPayloadDocument as narrowResumeEventOnlyFromPayloadDocument } from '../src/runtime/event-only-resume.ts';
import { resumeEventFromPayloadDocument as narrowResumeEventFromPayloadDocument } from '../src/runtime/event-resume.ts';
import { render as narrowRender } from '../src/runtime/render.ts';
import { renderToString as narrowRenderToString } from '../src/runtime/render-to-string.ts';
import { resumeFromPayloadDocument as narrowResumeFromPayloadDocument } from '../src/runtime/resume.ts';
import { arcade as viteArcade } from '../src/vite.ts';

function readSource(relativePath: string): Promise<string> {
	return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

test('main package exposes the curated author and build surface', () => {
	expect(typeof state).toBe('function');
	expect(typeof computed).toBe('function');
	expect(typeof element).toBe('function');
	expect(typeof shared).toBe('function');
	expect(typeof render).toBe('function');
	expect(typeof renderToString).toBe('function');
	expect(typeof resumeFromPayloadDocument).toBe('function');
	expect(typeof resumeFromPayloadScripts).toBe('function');
	expect(typeof narrowApplyDomJournalEntries).toBe('function');
	expect(typeof createNarrowDomUpdateEntry).toBe('function');
	expect(typeof narrowResumeEventOnlyFromPayloadDocument).toBe('function');
	expect(typeof narrowResumeEventFromPayloadDocument).toBe('function');
	expect(typeof narrowRender).toBe('function');
	expect(typeof narrowRenderToString).toBe('function');
	expect(typeof narrowResumeFromPayloadDocument).toBe('function');
	expect(typeof arcadeClient).toBe('function');
	expect(typeof viteArcade).toBe('function');
	expect(typeof Link).toBe('function');
	expect(typeof router).toBe('function');
});

test('root and grouped runtime entries use internal package boundaries deliberately', async () => {
	const staleScope = '@arcade' + 'js/';
	const [indexSource, runtimeSource] = await Promise.all([
		readSource('../src/index.ts'),
		readSource('../src/runtime.ts'),
	]);

	expect(indexSource).not.toContain(staleScope);
	expect(runtimeSource).not.toContain(staleScope);
	expect(indexSource).not.toContain("from 'arcade'");
	expect(indexSource).toContain("from './render.ts'");
	expect(indexSource).toContain("from '@arcade/web/render-to-string'");
	expect(indexSource).toContain("from '@arcade/web/resume'");
	expect(indexSource).toContain("from '@arcade/bundler/rolldown'");
	expect(runtimeSource).toContain("from '@arcade/web/render'");
	expect(runtimeSource).toContain("from '@arcade/web/render-to-string'");
	expect(runtimeSource).toContain("from '@arcade/web/resume'");
});

test('root render fallback delegates mounting to the runtime render path', async () => {
	const root = {
		nodeType: 1,
		tagName: 'DIV',
		childNodes: [],
		listeners: [],
		addEventListener() {},
	};
	const target = {
		children: [] as Array<typeof root>,
		appendChild(child: typeof root) {
			this.children.push(child);
		},
	};

	await render(() => ({ root }), { target });

	expect(target.children).toEqual([root]);
});
