import stickers from '../public/stickers/manifest.json' with { type: 'json' };
import { asset } from '../site-base.ts';

// One of the owner's die-cut stickers, cut out of `stickers-sheet.png` by
// `tooling/cut-sprites.ts`. A sticker carries its own white border and printed
// shadow, so one file reads on both the paper and the dark ground and there is
// no dark twin the way a crayon sprite has one. `spot` names a placement:
// `hero` floats one past the corner of the landing title, `callout` sits one on
// the corner of a callout.
export default function Sticker({
	name,
	size,
	alt,
	spot,
}: {
	readonly name: string;
	readonly size?: string;
	readonly alt?: string;
	readonly spot?: string;
}) @{
	const label = alt ?? '';
	const hidden = label === '' ? 'true' : 'false';
	const cut = stickers.stickers.find((sticker) => sticker.name === name);
	if (!cut) throw new Error(`Sticker '${name}' is not in public/stickers/manifest.json.`);

	<img
		class={spot ? 'sticker is-' + spot : 'sticker'}
		src={asset('stickers/' + name + '.png')}
		alt={label}
		aria-hidden={hidden}
		width={cut.w}
		height={cut.h}
		style={'--sticker-size:' + (size ?? '3rem')}
		decoding="async"
	/>
}
