import { computed, shared, state } from '@markless/core';

export const gateState = shared(
	() => {
		const gate = state({ offset: 0 });

		const cells = computed(() => {
			const rows: { iso: string; day: number; slot: number }[] = [];
			for (let at = 0; at < 7; at += 1) {
				rows.push({ iso: `x-${gate.offset * 7 + at}`, day: gate.offset * 7 + at, slot: at });
			}
			return rows;
		});

		return {
			...gate,
			cells,
			step() {
				gate.offset = gate.offset + 1;
			},
		};
	},
	{ scope: 'widget' },
);

export function GateRoot({ children, ...rest }: { readonly children?: unknown }) @{
	const gate = gateState();

	<div {...rest} ui-offset={gate.offset}>{children}</div>
}

export function GateItem({
	value,
	children,
	...rest
}: { readonly value: string; readonly children?: unknown }) @{
	const gate = gateState();
	const cell = state({ value });
	const isFirst = computed(() => cell.value === `x-${gate.offset * 7}`);

	<button {...rest} type="button" ui-value={cell.value} ui-first={isFirst}>{children}</button>
}

export function GateShift({ children, ...rest }: { readonly children?: unknown }) @{
	const gate = gateState();

	<button
		{...rest}
		type="button"
		onClick={() => {
			gate.step();
		}}
	>{children}</button>
}
