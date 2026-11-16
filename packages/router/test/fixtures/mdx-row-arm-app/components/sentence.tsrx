import Term from './term.tsrx';
import { pieces } from './pieces.ts';

export default function Sentence({ text, terms }: { readonly text: string; readonly terms?: string }) @{
	const parts = pieces(text, terms ?? '');

	<>
	@if (terms) {
		<div class="sentence">
			@for (const part of parts; key part.key) {
				@if (part.term) {
					<Term word={part.text} />
				} @else {
					<>{` ${part.text} `}</>
				}
			}
		</div>
	} @else {
		<p>{text}</p>
	}
	</>
}
