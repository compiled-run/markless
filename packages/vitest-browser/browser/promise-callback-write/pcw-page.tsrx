import { state } from '@markless/core';
import { later } from './pcw-later.ts';

export default function PromiseCallbackPage() @{
	let label = state('idle');
	const view = state({ rows: [] as readonly string[], status: 'idle' });
	<section>
		<button
			type="button"
			data-let
			onClick={() => {
				later('loaded').then((value) => {
					label = value;
				});
			}}
		>
			let
		</button>
		<button
			type="button"
			data-object
			onClick={() => {
				view.status = 'waiting';
				later(['a', 'b']).then((rows) => {
					view.rows = rows;
					view.status = 'ready';
				});
			}}
		>
			object
		</button>
		<output data-label>{label}</output>
		<output data-status>{view.status}</output>
		<output data-rows>{view.rows.join(',')}</output>
	</section>
}
