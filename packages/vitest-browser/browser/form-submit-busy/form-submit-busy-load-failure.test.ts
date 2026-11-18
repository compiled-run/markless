import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '../../src/index.ts';
import { poll, shows } from '../back-revalidate/support.ts';
import { installServer, resetServer, server } from '../mutations-refresh/server.ts';
import { NoteForm } from './note-form.tsrx';

// The hold fails as it starts, the path a module that cannot load also takes: the submission still goes, unmarked, and nothing is left unhandled.
vi.mock('../../../web/src/submit-hold.ts', () => ({
	holdSubmit: () => {
		throw new Error('the hold failed');
	},
}));

installServer();
beforeEach(() => resetServer());
afterEach(() => cleanup());

test('when the hold fails, submissions still go and no rejection is left unhandled', async () => {
	const unhandled: unknown[] = [];
	const hear = (event: PromiseRejectionEvent) => unhandled.push(event.reason);
	addEventListener('unhandledrejection', hear);
	try {
		const container = (await render(NoteForm)).container as HTMLElement;
		await shows(container, '[data-names]', 'Ada');
		const form = container.querySelector<HTMLFormElement>('[data-form]')!;
		const submitter = container.querySelector<HTMLButtonElement>('[data-submit]')!;
		submitter.click();
		await shows(container, '[data-names]', 'Ada, Grace');
		submitter.click();
		await expect.poll(() => server.posts.length, poll).toBe(2);
		await shows(container, '[data-names]', 'Ada, Grace, Grace');
		expect(form.hasAttribute('aria-busy')).toBe(false);
		expect(unhandled).toEqual([]);
	} finally {
		removeEventListener('unhandledrejection', hear);
	}
});
