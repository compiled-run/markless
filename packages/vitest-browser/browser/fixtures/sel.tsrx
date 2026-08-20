import { shared, state } from '@markless/core';

export const sel = shared(() => {
	const s = state({ open: false });

	return {
		...s,
		toggle() {
			s.open = !s.open;
		},
	};
}, { scope: 'widget' });

export function Root({ children }) @{
	const s = sel();

	<div data-sel-root ui-open={s.open}>{children}</div>
}

export function Trigger() @{
	const s = sel();

	<button type="button" data-sel-trigger onClick={() => s.toggle()}>Toggle</button>
}

export function Content() @{
	const s = sel();

	<span data-sel-content>{s.open}</span>
}

export const pop = shared(() => {
	const p = state({ open: false });

	return {
		...p,
		toggle() {
			p.open = !p.open;
		},
	};
}, { scope: 'widget' });

export function PopRoot({ children }) @{
	const p = pop();

	<div data-pop-root ui-open={p.open}>{children}</div>
}

export function PopTrigger() @{
	const p = pop();

	<button type="button" data-pop-trigger onClick={() => p.toggle()}>Pop</button>
}
