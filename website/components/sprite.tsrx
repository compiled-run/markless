// One of the owner's hand-drawn crayon doodles, cut out of `sprites-sheet.png`
// by `tooling/cut-sprites.ts`. `public/sprites/` holds two files per sprite: the
// drawing as it was scanned, and a `.dark.png` whose dark crayon outline has been
// lifted to chalk so it still reads on the dark ground. Both are in the markup and
// CSS shows the one that matches the theme, because CSS cannot swap an image `src`.
export default function Sprite({
	name,
	size,
	alt,
}: {
	readonly name: string;
	readonly size?: string;
	readonly alt?: string;
}) @{
	const label = alt ?? '';
	const hidden = label === '' ? 'true' : 'false';

	<span class="sprite" style={'--sprite-size:' + (size ?? '1.6em')}>
		<img
			class="sprite-ink sprite-ink-light"
			src={'/markless/sprites/' + name + '.png'}
			alt={label}
			aria-hidden={hidden}
			decoding="async"
		/>
		<img
			class="sprite-ink sprite-ink-dark"
			src={'/markless/sprites/' + name + '.dark.png'}
			alt=""
			aria-hidden="true"
			decoding="async"
		/>
	</span>
}
