import { expect, test } from 'vitest';
import { applyDomJournalEntries } from '../src/dom-journal.ts';
import { createDomUpdateEntry } from '../src/dom-update.ts';
import {
	createEventOnlyResumeContainerFromPayloads,
	resumeEventOnlyFromPayloadDocument,
} from '../src/event-only-resume.ts';
import {
	createEventResumeContainerFromPayloadDocument,
	resumeEventFromPayloadDocument,
} from '../src/event-resume.ts';
import { createRuntimeGraph } from '../src/graph.ts';
import { decodePayloadScripts } from '../src/payload.ts';
import { render } from '../src/render.ts';
import { renderToString } from '../src/render-to-string.ts';
import { createResumeRuntime } from '../src/resume.ts';

test('runtime split modules expose graph, payload, event resume, render, DOM update, DOM journal, and resume boundaries', () => {
	expect(typeof applyDomJournalEntries).toBe('function');
	expect(typeof createDomUpdateEntry).toBe('function');
	expect(typeof createEventOnlyResumeContainerFromPayloads).toBe('function');
	expect(typeof resumeEventOnlyFromPayloadDocument).toBe('function');
	expect(typeof createEventResumeContainerFromPayloadDocument).toBe('function');
	expect(typeof resumeEventFromPayloadDocument).toBe('function');
	expect(typeof createRuntimeGraph).toBe('function');
	expect(typeof decodePayloadScripts).toBe('function');
	expect(typeof render).toBe('function');
	expect(typeof renderToString).toBe('function');
	expect(typeof createResumeRuntime).toBe('function');
});
