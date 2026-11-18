import { state } from '@markless/core';
import PlaceLine from './place-line.tsrx';

export default function SyncBareIndex() @{
	let items = state(['x']);
	<div>
		<button data-add onClick={() => (items = ['w', ...items])}>add</button>
		@for (const item of items; index place; key item) {
			<PlaceLine label={item} place={place} />
		}
	</div>
}
