import InkLogo, { type Mark } from './ink-logo.tsrx';

/** A paragraph with a small ink drawing before chosen phrases. `marks` lists `mark:phrase` pairs separated by `|`; each phrase must appear in `text`. */
export default function MarkedText({ text, marks }: { readonly text: string; readonly marks: string }) @{
	const pieces: { key: string; text: string; mark?: Mark }[] = [];
	let rest = text;
	for (const pair of marks.split('|')) {
		const [mark, phrase] = pair.split(':') as [Mark, string];
		const at = rest.indexOf(phrase);
		if (at < 0) throw new Error(`MarkedText: "${phrase}" is not in the text`);
		pieces.push({ key: 'text' + pieces.length, text: rest.slice(0, at) });
		const word = phrase.split(' ')[0]!;
		pieces.push({ key: mark, text: word, mark });
		rest = rest.slice(at + word.length);
	}
	pieces.push({ key: 'end', text: rest });

	<p>
		@for (const piece of pieces; key piece.key) {
			@if (piece.mark) {
				<span class="marked">
					<InkLogo mark={piece.mark} />
					{piece.text}
				</span>
			} @else {
				<>{piece.text}</>
			}
		}
		<style>
			.marked {
				white-space: nowrap;
			}
		</style>
	</p>
}
