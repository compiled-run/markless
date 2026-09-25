import { state } from '@markless/core';

export default function NativeEditBeforeResume() @{
	let count = state(0);

	<main>
		<div contenteditable="true" data-surface>
			<span contenteditable="false" data-chip>chip</span>
			{' text'}
		</div>
		<p data-after>after</p>
		<button data-bump onClick={() => count++}>{`bump ${count}`}</button>
	</main>
}
