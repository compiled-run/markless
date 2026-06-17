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
import { createDomUpdateEntry as createNarrowDomUpdateEntry } from '../src/runtime/dom-update.ts';
import { resumeEventOnlyFromPayloadDocument as narrowResumeEventOnlyFromPayloadDocument } from '../src/runtime/event-only-resume.ts';
import { resumeEventFromPayloadDocument as narrowResumeEventFromPayloadDocument } from '../src/runtime/event-resume.ts';
import { render as narrowRender } from '../src/runtime/render.ts';
import { renderToString as narrowRenderToString } from '../src/runtime/render-to-string.ts';
import { resumeFromPayloadDocument as narrowResumeFromPayloadDocument } from '../src/runtime/resume.ts';
import { arcade as viteArcade } from '../src/vite.ts';

test('main package exposes the curated author and build surface', () => {
	expect(typeof state).toBe('function');
	expect(typeof computed).toBe('function');
	expect(typeof element).toBe('function');
	expect(typeof shared).toBe('function');
	expect(typeof render).toBe('function');
	expect(typeof renderToString).toBe('function');
	expect(typeof resumeFromPayloadDocument).toBe('function');
	expect(typeof resumeFromPayloadScripts).toBe('function');
	expect(typeof createNarrowDomUpdateEntry).toBe('function');
	expect(typeof narrowResumeEventOnlyFromPayloadDocument).toBe('function');
	expect(typeof narrowResumeEventFromPayloadDocument).toBe('function');
	expect(typeof narrowRender).toBe('function');
	expect(typeof narrowRenderToString).toBe('function');
	expect(typeof narrowResumeFromPayloadDocument).toBe('function');
	expect(typeof arcadeClient).toBe('function');
	expect(typeof viteArcade).toBe('function');
});
