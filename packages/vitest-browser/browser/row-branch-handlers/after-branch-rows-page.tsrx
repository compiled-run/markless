import { state } from '@markless/core';

type Line = { readonly id: string; readonly label: string; readonly starred: boolean };

export default function AfterBranchRowsPage() @{
	let lines = state<readonly Line[]>([
		{ id: 'l1', label: 'first', starred: false },
		{ id: 'l2', label: 'second', starred: true },
	]);
	let renamed = state('none');
	<main>
		<output data-renamed>{renamed}</output>
		<ul>
			@for (const line of lines; key line.id) {
				<li data-line={line.id}>
					@if (line.starred) { <b class="star">*</b> } @else { <i class="plain">-</i> }
					<span class="label">{line.label}</span>
					<button
						type="button"
						data-star={line.id}
						onClick={() => (lines = lines.map((each) => (each.id === line.id ? { ...each, starred: !each.starred } : each)))}
					>
						star
					</button>
					<button
						type="button"
						data-rename={line.id}
						onClick={() => {
							renamed = line.id;
							lines = lines.map((each) => (each.id === line.id ? { ...each, label: each.label + '!' } : each));
						}}
					>
						rename
					</button>
				</li>
			}
		</ul>
	</main>
}
