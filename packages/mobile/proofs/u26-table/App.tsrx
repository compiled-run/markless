import { state } from '@markless/core';
import { table } from '@markless/ui';

export default function App() @{
	let picked = state('none');
	<main>
		<h1>Files</h1>
		<table.root value={[]} onChange={(next) => (picked = next.join(',') || 'none')}>
			<tbody>
				<table.item value="readme">
					<td>README.md</td>
				</table.item>
				<table.item value="license">
					<td>LICENSE</td>
				</table.item>
				<table.item value="secret" disabled>
					<td>secret.key</td>
				</table.item>
			</tbody>
		</table.root>
		<p>{`Picked ${picked}`}</p>
	</main>
}
