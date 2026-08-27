import { element, shared, state } from '@markless/core';

// A widget family whose ROOT carries a handler calling the dispatching shared
// method, beside a part that calls the same method. Both routes must reach the
// consumer's callback.
export const cbs = shared(
	() => {
		const s = state({ on: false, hits: 0 });
		const triggerEl = element<HTMLButtonElement>();

		return {
			...s,
			triggerEl,
			onChange: undefined as ((next: boolean) => void) | undefined,
			toggle() {
				const next = s.on === true ? false : true;
				s.on = next;
				s.hits = s.hits + 1;
				s.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

export function CbsRoot({ on = false, onChange, children }) @{
	const s = cbs();
	s.onChange = onChange;
	s.on = on;

	<div data-cbs-root data-on={s.on} onKeydown={() => s.toggle()}>{children}</div>
}

export function CbsTrigger() @{
	const s = cbs();

	<button type="button" el={s.triggerEl} data-cbs-trigger onClick={() => s.toggle()}>
		{s.on}
	</button>
}

export function CbsHits() @{
	const s = cbs();

	<output data-cbs-hits>{s.hits}</output>
}
