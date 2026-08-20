import { shared, state } from '@markless/core';

// A widget family that exercises the shared-factory lowering seam: a type
// assertion in the factory's state() initializer, a method whose body holds a
// local and three statements, composite template expressions over the shared
// instance, and a root seed the consumer may omit.
export const tri = shared(() => {
	const t = state({ checked: false as boolean | 'mixed', blocked: false, changes: 0 });

	return {
		...t,
		toggle() {
			const next = t.checked === true ? false : true;
			t.checked = next;
			t.changes = t.changes + 1;
		},
	};
}, { scope: 'widget' });

export function Root({ checked, blocked, children }) @{
	const t = tri();
	t.checked = checked;
	t.blocked = blocked;

	<div data-tri-root ui-mixed={t.checked === 'mixed'} ui-blocked={t.blocked === true}>
		{children}
	</div>
}

export function Trigger() @{
	const t = tri();

	<button
		type="button"
		data-tri-trigger
		ui-checked={t.checked === true}
		aria-checked={t.checked === 'mixed' ? 'mixed' : t.checked === true ? 'true' : 'false'}
		onClick={() => t.toggle()}
	>{t.checked}</button>
}

export function Counter() @{
	const t = tri();

	<span data-tri-counter>{t.changes}</span>
}
