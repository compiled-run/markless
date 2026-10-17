import { state } from '@markless/core';
import { DropdownTrigger } from './dropdown-trigger.tsrx';

export function UserRow({ name, instance }: { readonly name: string; readonly instance: string }) @{
	let selected = state(false);
	<tr data-user={instance}>
		<td>
			<button type="button" data-select={instance} onClick={() => (selected = !selected)}>
				{selected ? 'on' : 'off'}
			</button>
		</td>
		<td>{name}</td>
		<td>
			<DropdownTrigger menu="row-actions" instance={instance} class="trigger">
				<span class="sr-only">Open menu</span>
			</DropdownTrigger>
		</td>
	</tr>;
}
