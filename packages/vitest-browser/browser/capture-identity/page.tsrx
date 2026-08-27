import { computed, state } from '@markless/core';

// The markup reads the component-scope `loud`; each handler declares its own
// `loud` that shadows it. The two spellings are the same word and different
// bindings, so the page only compiles if capture analysis tells them apart.
export default function CaptureIdentityPage() @{
	const cell = state({ label: 'quiet', seen: '', tally: '' });
	const loud = computed(() => cell.label.toUpperCase());

	<section data-capture-identity>
		<output data-loud>{loud}</output>
		<output data-seen>{cell.seen}</output>
		<output data-tally>{cell.tally}</output>
		<button type="button" data-shout onClick={() => (cell.label = 'louder')}>shout</button>
		<button
			type="button"
			data-local
			onClick={() => {
				const loud = (text: string) => `${text}!`;
				cell.seen = loud(cell.label);
			}}
		>
			local
		</button>
		<button
			type="button"
			data-nested
			onClick={() => {
				cell.tally = [cell.label]
					.map((item) => {
						const loud = (text: string) => text.length;
						return String(loud(item));
					})
					.join('');
			}}
		>
			nested
		</button>
	</section>
}
