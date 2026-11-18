import { state } from '@markless/core';
import PlaceLine from './place-line.tsrx';

export default function SyncComponent() @{
	let items = state(['x']);
	<div>
		<button data-add onClick={() => (items = ['w', ...items])}>add</button>
		@for (const item of items; index place; key item) {
			<PlaceLine label={item} place={place + 1} />
		}
	</div>
}
