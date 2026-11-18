import { state } from '@markless/core';

export default function SyncInline() @{
	let items = state(['x']);
	<div>
		<button data-add onClick={() => (items = ['w', ...items])}>add</button>
		@for (const item of items; index place; key item) {
			<p data-r>{place + 1}. {item}</p>
		}
	</div>
}
