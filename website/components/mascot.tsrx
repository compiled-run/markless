import { asset } from '../site-base.ts';

// One of the sibling projects' mascots, cut out of `mascots.png` by
// `tooling/cut-sprites.ts`. Each sticker carries its own white outline, so one
// file reads on both the paper and the dark ground and there is no dark variant.
// The Markless mascot itself is the live drawing in `mascot/markless-mug.tsrx`.
export default function Mascot({
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

	<img
		class="mascot"
		src={asset('mascots/' + name + '.png')}
		alt={label}
		aria-hidden={hidden}
		style={'--mascot-size:' + (size ?? '6rem')}
		decoding="async"
	/>
}
