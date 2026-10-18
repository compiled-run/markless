import { expect, test } from 'vitest';
import { emitQueuedResumeContainerEvent } from '../src/source-module.ts';

// A streamed page forwards one click twice (the inline resumer and the stream
// executor both listen on the container), and the self-wake's event-less
// dispatch can land between the two copies.

type Root = Record<string, unknown>;
type Dispatch = (input: { root: Root; event: unknown }) => Promise<void>;

function queuedEntry(handled: unknown[]): Dispatch {
	const source = emitQueuedResumeContainerEvent(
		'export async function resumeContainerEvent(input) { handled.push(input.event); }',
		{ censusRepair: false },
	).replace('export function resumeContainerEvent', 'return function resumeContainerEvent');
	return new Function('handled', source)(handled) as Dispatch;
}

test('a click forwarded twice runs once even when a wake dispatch lands between the copies', async () => {
	const handled: unknown[] = [];
	const resumeContainerEvent = queuedEntry(handled);
	const root: Root = {};
	const click = { type: 'click', timeStamp: 336 };

	await Promise.all([
		resumeContainerEvent({ root, event: click }),
		resumeContainerEvent({ root, event: 0 }),
		resumeContainerEvent({ root, event: click }),
	]);

	expect(handled).toEqual([click, 0]);
});

test('separate clicks and separate wakes still each dispatch', async () => {
	const handled: unknown[] = [];
	const resumeContainerEvent = queuedEntry(handled);
	const root: Root = {};
	const first = { type: 'click', timeStamp: 10 };
	const second = { type: 'click', timeStamp: 20 };

	await Promise.all([
		resumeContainerEvent({ root, event: first }),
		resumeContainerEvent({ root, event: 0 }),
		resumeContainerEvent({ root, event: second }),
		resumeContainerEvent({ root, event: 0 }),
		resumeContainerEvent({ root, event: first }),
	]);

	expect(handled).toEqual([first, 0, second, 0]);
});
