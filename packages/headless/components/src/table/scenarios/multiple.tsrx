import { state } from '@markless/core';
import { table } from '../../index.ts';

// Several rows at once. The callback writes into page state the page renders, so
// what the DOM shows is what it was called with and how often.
export default function Multiple() @{
	const log = state({ picked: '', calls: 0 });

	<section>
		<table.root
			multiple
			data-testid="root"
			onChange={(next: readonly string[]) => {
				log.picked = next.join(' ');
				log.calls = log.calls + 1;
			}}
		>
			<caption>Files</caption>
			<thead>
				<tr>
					<th>Name</th>
					<th>Size</th>
				</tr>
			</thead>
			<tbody>
				<table.item value="readme" data-testid="readme-item">
					<td>README.md</td>
					<td>4.1 kB</td>
				</table.item>
				<table.item value="license" data-testid="license-item">
					<td>LICENSE</td>
					<td>1.1 kB</td>
				</table.item>
				<table.item value="changelog" data-testid="changelog-item">
					<td>CHANGELOG.md</td>
					<td>12.4 kB</td>
				</table.item>
				<table.item value="notice" data-testid="notice-item">
					<td>NOTICE</td>
					<td>0.4 kB</td>
				</table.item>
			</tbody>
		</table.root>
		<p data-testid="picked">{log.picked}</p>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
