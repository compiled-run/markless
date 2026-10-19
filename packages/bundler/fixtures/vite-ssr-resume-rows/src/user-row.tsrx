import { computed, state } from '@markless/core';
import { field, type RowView } from './table.ts';

export type UserRowProps = {
	readonly rows: readonly RowView[];
	readonly slot: number;
	readonly onToggle: () => void;
};

export function UserRow({ rows, slot, onToggle }: UserRowProps) @{
	const rowHidden = computed(() => !field(rows, slot, 'shown'));
	const rowState = computed(() => (field(rows, slot, 'selected') ? 'selected' : 'idle'));
	const rowChecked = computed(() => (field(rows, slot, 'selected') ? 'true' : 'false'));
	const rowName = computed(() => field(rows, slot, 'name'));
	const rowEmail = computed(() => field(rows, slot, 'email'));
	const rowRole = computed(() => field(rows, slot, 'role'));
	let open = state(false);

	<tr data-state={rowState} hidden={rowHidden}>
		<td>
			<button
				type="button"
				role="checkbox"
				aria-checked={rowChecked}
				onClick={() => onToggle()}
			>
				select
			</button>
		</td>
		<td>{rowName}</td>
		<td>{rowEmail}</td>
		<td data-role={rowRole}>{rowRole}</td>
		<td>
			<button
				type="button"
				aria-expanded={open ? 'true' : 'false'}
				onClick={() => (open = !open)}
			>
				menu
			</button>
		</td>
	</tr>;
}
