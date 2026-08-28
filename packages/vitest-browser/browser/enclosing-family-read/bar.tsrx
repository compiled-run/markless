import { element, shared, state } from '@markless/core';
import { rosterOf } from './report.ts';

// The ENCLOSING family. `Bar` seeds it, so `Bar` is its widget root and every
// other component that resolves `barState` is an ordinary part of the enclosing
// rendered bar - including a component that roots a family of its own.
export const barState = shared(
	() => {
		const bar = state({ role: '', label: '', active: 0, moves: 0, roster: '' });
		const itemEls = element<HTMLButtonElement[]>();

		return { ...bar, itemEls };
	},
	{ scope: 'widget' },
);

export function Bar({ role = 'toolbar', label = '', children }) @{
	const bar = barState();
	bar.role = role;
	bar.label = label;

	<div
		data-bar
		data-label={bar.label}
		role={bar.role}
		data-roster={bar.roster}
		data-active={bar.active}
		data-moves={bar.moves}
		onKeydown={(event) => {
			const items = bar.itemEls;
			if (!Array.isArray(items) || items.length === 0) return;
			if (event.key === 'ArrowRight') bar.active = (bar.active + 1) % items.length;
			else if (event.key === 'ArrowLeft')
				bar.active = (bar.active + items.length - 1) % items.length;
			else return;
			bar.moves = bar.moves + 1;
			items[bar.active]?.focus();
		}}
	>
		<button
			type="button"
			data-bar-probe
			onClick={() => {
				bar.roster = rosterOf(bar.itemEls);
			}}
		>probe</button>
		{children}
	</div>
}

// The CONTROL: an ordinary part of this same module, rooting nothing of its own.
// Whatever the roster answers for these is the baseline the other two axes are
// measured against.
export function BarItem({ name }) @{
	const bar = barState();

	<button type="button" data-knob data-name={name} el={bar.itemEls} tabindex={0}>{name}</button>
}
