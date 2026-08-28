import { computed, element, shared, state } from '@markless/core';

// The calendar's grid shape reduced to one widget: a 42-key collection COMPUTED
// off a month cell, rows that are a component rather than a template, and a
// plural element() handle the month-change handler reads back on its next
// statement to land focus on the day it just wrote.
export const ccr = shared(
	() => {
		const s = state({
			monthSeed: '2026-08',
			monthAt: '',
			focusAt: '',
			landed: 'none',
			rowsSeen: 'unread',
		});
		const dayEls = element<HTMLButtonElement[]>();

		// Written out of platform globals only: a consumer module that reads one
		// cell of this factory takes the whole derived set without this module's
		// imports.
		const days = computed(() => {
			const seed = s.monthAt !== '' ? s.monthAt : s.monthSeed;
			const parts = seed.split('-');
			const at = new Date(2000, 0, 1);
			at.setFullYear(Number(parts[0]), Number(parts[1]) - 1, 1);
			at.setDate(at.getDate() - at.getDay());
			const rows: string[] = [];
			for (let step = 0; step < 42; step += 1) {
				const year = `${at.getFullYear()}`.padStart(4, '0');
				const month = `${at.getMonth() + 1}`.padStart(2, '0');
				const day = `${at.getDate()}`.padStart(2, '0');
				rows.push(`${year}-${month}-${day}`);
				at.setDate(at.getDate() + 1);
			}
			return rows;
		});
		const title = computed(() => (s.monthAt !== '' ? s.monthAt : s.monthSeed));

		return {
			...s,
			dayEls,
			days,
			title,

			/** A page key: the month moves and the focused day moves with it. */
			page(step: number) {
				const seed = s.monthAt !== '' ? s.monthAt : s.monthSeed;
				const parts = seed.split('-');
				const at = new Date(2000, 0, 1);
				at.setFullYear(Number(parts[0]), Number(parts[1]) - 1 + step, 1);
				const year = `${at.getFullYear()}`.padStart(4, '0');
				const month = `${at.getMonth() + 1}`.padStart(2, '0');
				const from = s.focusAt !== '' ? s.focusAt : `${seed}-14`;
				const next = `${year}-${month}-${from.slice(8)}`;
				s.monthAt = `${year}-${month}`;
				s.focusAt = next;
				const minted = dayEls ?? [];
				s.rowsSeen = `${minted.length}:${minted[0]?.getAttribute('value') ?? '?'}`;
				const target = minted.find((day) => day.getAttribute('value') === next);
				s.landed = target ? 'found' : 'missing';
				target?.focus();
			},
		};
	},
	{ scope: 'widget' },
);

export function CcrRoot({ month = '2026-08', children }) @{
	const c = ccr();
	c.monthSeed = month;

	<div
		data-ccr-root
		onKeyDown={(event) => {
			if (event.key === 'PageDown') c.page(1);
			if (event.key === 'PageUp') c.page(-1);
		}}
	>{children}</div>
}

export function CcrTitle() @{
	const c = ccr();

	<h2 data-ccr-title>{c.title}</h2>
}

export function CcrItem({ value }) @{
	const c = ccr();
	const day = state({ value });

	const isFocused = computed(() => c.focusAt === day.value);

	<button
		type="button"
		data-ccr-item
		el={c.dayEls}
		value={day.value}
		tabindex={isFocused ? 0 : -1}
	>{day.value}</button>
}

export function CcrLanded() @{
	const c = ccr();

	<output data-ccr-landed>{c.landed}</output>
}

export function CcrRowsSeen() @{
	const c = ccr();

	<output data-ccr-rows-seen>{c.rowsSeen}</output>
}
