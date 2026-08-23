import { element, shared, state } from '@markless/core';

// Shape 2: the handle lives on a shared() factory instance, so every read of it
// is a MEMBER expression (`tabs.panelEl`) rather than a bare identifier.
export const ehv = shared(
	() => {
		const s = state({ hits: 0 });
		const panelEl = element<HTMLDivElement>();

		return { ...s, panelEl };
	},
	{ scope: 'widget' },
);

export function EhvSharedRoot({ children }) @{
	const s = ehv();

	<div data-ehv-shared-root data-hits={s.hits}>{children}</div>
}

export function EhvSharedPanel() @{
	const s = ehv();

	<div data-ehv-shared-panel el={s.panelEl}>panel</div>
}

export function EhvSharedTrigger() @{
	const s = ehv();

	<button type="button" data-ehv-shared-trigger onClick={() => {
		s.hits = s.hits + 1;
		s.panelEl.setAttribute('data-shared-hit', 'yes');
	}}>poke</button>
}
