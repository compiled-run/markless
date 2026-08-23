import { computed, shared, state } from '@markless/core';

// Minimal reproduction shape for defect 56: one part writes a field on the
// group's shared widget instance, and other parts built inside a keyed @for row
// read that field back.
export const krs = shared(
	() => {
		const group = state({ name: '' });

		return {
			...group,
			rename(next: string) {
				group.name = next;
			},
		};
	},
	{ scope: 'widget' },
);

export function Root({ children }) @{
	const group = krs();

	<fieldset data-krs-root data-krs-root-name={group.name}>{children}</fieldset>
}

// The declaring part: it shows nothing and exists only to write the shared field.
export function Field({ name = '' }) @{
	const group = krs();
	group.name = name;

	<span data-krs-field hidden />
}

// A reading part. Placed flat it is the control; placed in a row it is the probe.
export function Item() @{
	const group = krs();

	<input data-krs-item type="hidden" name={group.name} />
}

// The same read taken through a graph cell rather than as a bare field read.
export function ComputedItem() @{
	const group = krs();
	const shown = computed(() => group.name);

	<input data-krs-computed-item type="hidden" name={shown} />
}

// A write that lands AFTER the rows exist.
export function Renamer() @{
	const group = krs();

	<button type="button" data-krs-rename onClick={() => group.rename('late')}>rename</button>
}
