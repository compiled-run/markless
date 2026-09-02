import { state } from '@markless/core';
import type { PropsOf } from '@markless/core';

function Drawer({ children, ...rest }: PropsOf<'section'>) @{
	const gate = state({ open: true });
	<section {...rest}>
		<button
			type="button"
			data-testid="drawer-toggle"
			onClick={() => {
				gate.open = !gate.open;
			}}
		>Toggle</button>
		@if (gate.open) {
			<ol data-testid="drawer-list">{children}</ol>
		} @else {
			<p data-testid="drawer-closed">Closed.</p>
		}
	</section>
}

export default function HoleUnderIf() @{
	const box = state({
		rows: [{ value: 'alpha' }, { value: 'beta' }],
		picked: 'none',
	});

	<div>
		<button
			type="button"
			data-testid="add"
			onClick={() => {
				box.rows = [...box.rows, { value: 'gamma' }];
			}}
		>Add</button>
		<button
			type="button"
			data-testid="drop"
			onClick={() => {
				box.rows = box.rows.slice(0, -1);
			}}
		>Drop</button>
		<output data-testid="picked">{box.picked}</output>
		<Drawer data-testid="drawer">
			@for (const row of box.rows; key row.value) {
				<li data-testid="drawer-row">
					<button
						type="button"
						data-testid="pick"
						onClick={() => {
							box.picked = row.value;
						}}
					>{row.value}</button>
				</li>
			}
		</Drawer>
	</div>
}
