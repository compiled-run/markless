import { shared, state } from '@markless/core';
import { mark, resetTrail } from './mb-report.ts';

export const mbEvents = shared(
	() => {
		const s = state({ trail: '' });

		return { ...s };
	},
	{ scope: 'widget' },
);

export function MbEventsRoot({ children }) @{
	const box = mbEvents();

	<div data-mb-events-root data-trail={box.trail}>{children}</div>
}

// `onClick={[a, b, c]}` runs in the order it is written. Each entry is its own
// handler, so the trail below is authored order and nothing else.
export function MbOrder() @{
	const box = mbEvents();

	<button type="button" data-mb-order onClick={[
		() => { box.trail = mark('one'); },
		() => { box.trail = mark('two'); },
		() => { box.trail = mark('three'); },
	]}>order</button>
}

// The second handler in the list ends the list, exactly as it would end a DOM
// listener list: the third never runs.
export function MbStopImmediate() @{
	const box = mbEvents();

	<button type="button" data-mb-stop onClick={[
		() => { box.trail = mark('first'); },
		(event) => { event.stopImmediatePropagation(); box.trail = mark('second'); },
		() => { box.trail = mark('third'); },
	]}>stop</button>
}

// A part that spreads its props AND writes its own handler for the same event.
// Under the retired shadow refusal this file would not compile.
export function MbMergeTrigger({ children, ...rest }) @{
	const box = mbEvents();

	<button {...rest} type="button" data-mb-merge onClick={() => {
		box.trail = mark('part');
	}}>{children}</button>
}

// The same shape, with the part's own handler stopping the list immediately: the
// consumer's forwarded handler is next in that ONE list, so it must not run.
export function MbMergeStopTrigger({ children, ...rest }) @{
	const box = mbEvents();

	<button {...rest} type="button" data-mb-merge-stop onClick={(event) => {
		box.trail = mark('part-stop');
		event.stopImmediatePropagation();
	}}>{children}</button>
}

export function MbReset() @{
	const box = mbEvents();

	<button type="button" data-mb-reset onClick={() => { box.trail = resetTrail(); }}>reset</button>
}
