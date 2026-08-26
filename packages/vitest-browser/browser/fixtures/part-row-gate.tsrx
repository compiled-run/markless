import { computed } from '@markless/core';
import { GateItem, GateRoot, GateShift, gateState } from './part-row-gate-parts.tsrx';

function Offset() @{
	const gate = gateState();

	<p data-testid="offset">{gate.offset}</p>
}

function PartRows() @{
	const gate = gateState();
	const rows = computed(() =>
		['0', '1', '2', '3', '4', '5', '6'].map((at) => `x-${gate.offset * 7 + Number(at)}`),
	);

	<div role="presentation" data-testid="parts">
		@for (const iso of rows; key iso) {
			<GateItem value={iso} data-testid="parts-cell">{iso}</GateItem>
		}
	</div>
}

function PlainRows() @{
	const gate = gateState();
	const rows = computed(() =>
		['0', '1', '2', '3', '4', '5', '6'].map((at) => `x-${gate.offset * 7 + Number(at)}`),
	);

	<div role="presentation" data-testid="plain">
		@for (const iso of rows; key iso) {
			<span data-testid="plain-cell" ui-value={iso}>{iso}</span>
		}
	</div>
}

// Rows over an object-element array the instance itself computes.
function CellRows() @{
	const gate = gateState();

	<div role="presentation" data-testid="cells">
		@for (const cell of gate.cells; key cell.iso) {
			<span data-testid="cells-cell" ui-value={cell.iso}>{cell.iso}</span>
		}
	</div>
}

export default function Gate() @{
	<main>
		<GateRoot data-testid="root">
			<GateShift data-testid="shift">Shift</GateShift>
			<Offset />
			<PartRows />
			<PlainRows />
			<CellRows />
		</GateRoot>
	</main>
}
