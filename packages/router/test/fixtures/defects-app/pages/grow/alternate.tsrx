import { computed, state } from '@markless/core';
import { CodeStrip, type Tag } from '../../src/code-strip.tsrx';

const TAGS: readonly Tag[] = [
	{ code: 7, label: 'seven' },
	{ code: 3, label: 'three' },
	{ code: 9, label: 'nine' },
	{ code: 1, label: 'one' },
];

export default function GrowAlternate() @{
	let floor = state(5);
	const above = computed(() => TAGS.filter((tag) => tag.code > floor));
	<article>
		<CodeStrip entries={above} />
		<button type="button" data-lower onClick={() => (floor = floor - 3)}>
			lower
		</button>
	</article>;
}
