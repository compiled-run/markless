import { computed, element, shared, state } from '@markless/core';

// The calendar family's three measured framework gaps, reduced to one widget:
// a boolean root prop read inside a shared method a PART calls, an array-valued
// root prop read from a part's computed(), and an element() handle bound by one
// part and named by another's IDREF under SSR resume.
export const cblk = shared(
	() => {
		const s = state({
			seed: null as string | null,
			monthSeed: '2026-08',
			monthAt: '',
			focusAt: '',
			min: '',
			max: '',
			unavailable: [] as string[],
			startofweek: 0,
			multiple: false,
			range: false,
			disabled: false,
			readonly: false,
			required: false,
			invalid: false,
			popup: false,
			open: false,
			name: '',
			picked: '',
			anchor: '',
			hits: 0,
		});
		const titleEl = element<HTMLHeadingElement>();
		const contentEl = element<HTMLDivElement>();

		// Written out of platform globals only: a consumer module that reads one
		// cell of this factory takes the whole derived set without this module's
		// imports.
		const days = computed(() => {
			const rows: string[] = [];
			for (let step = 10; step < 14; step += 1) rows.push(`${s.monthSeed}-${step}`);
			return rows;
		});

		return {
			...s,
			titleEl,
			contentEl,
			days,
			onChange: undefined as ((value: string) => void) | undefined,

			select(iso: string) {
				s.hits = s.hits + 1;
				if (s.disabled === true || s.readonly === true) return;
				if (s.min !== '' && iso < s.min) return;
				if (s.max !== '' && iso > s.max) return;
				if (s.unavailable.indexOf(iso) !== -1) return;
				s.focusAt = iso;
				if (s.range === true) {
					if (s.anchor === '') {
						s.anchor = iso;
						return;
					}
					const first = s.anchor;
					s.anchor = '';
					s.picked = `${first}..${iso}`;
					s.onChange?.(s.picked);
					return;
				}
				s.picked = iso;
				s.onChange?.(iso);
			},
		};
	},
	{ scope: 'widget' },
);

export function CblkRoot({
	value = null,
	month = '2026-08',
	multiple = false,
	range = false,
	min = '',
	max = '',
	unavailable = [],
	startofweek = 0,
	disabled = false,
	readonly = false,
	required = false,
	invalid = false,
	name = '',
	popup = false,
	onChange,
	children,
}) @{
	const c = cblk();
	c.onChange = onChange;
	c.seed = value;
	c.monthSeed = month;
	c.multiple = multiple;
	c.range = range;
	c.min = min;
	c.max = max;
	c.unavailable = unavailable;
	c.startofweek = startofweek;
	c.disabled = disabled;
	c.readonly = readonly;
	c.required = required;
	c.invalid = invalid;
	c.name = name;
	c.popup = popup;

	<div data-cblk-root ui-range={c.range}>{children}</div>
}

export function CblkContent({ children }) @{
	const c = cblk();

	<div data-cblk-content el={c.contentEl} role="group" aria-labelledby={c.titleEl}>
		{children}
	</div>
}

export function CblkTitle({ children }) @{
	const c = cblk();

	<h2 data-cblk-title el={c.titleEl}>{children}</h2>
}

export function CblkItem({ value }) @{
	const c = cblk();
	const day = state({ value });

	const isUnavailable = computed(() => c.unavailable.indexOf(day.value) !== -1);
	const ariaDisabled = computed(() => (isUnavailable ? 'true' : 'false'));

	<button
		type="button"
		data-cblk-item
		value={day.value}
		aria-disabled={ariaDisabled}
		ui-unavailable={isUnavailable}
		onClick={() => c.select(day.value)}
	>{day.value}</button>
}

export function CblkPicked() @{
	const c = cblk();

	<output data-cblk-picked>{c.picked}</output>
}

export function CblkAnchor() @{
	const c = cblk();

	<output data-cblk-anchor>{c.anchor}</output>
}

export function CblkHits() @{
	const c = cblk();

	<output data-cblk-hits>{c.hits}</output>
}
