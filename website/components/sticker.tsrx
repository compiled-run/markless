// One of the owner's die-cut stickers, cut out of `stickers-sheet.png` by
// `tooling/cut-sprites.ts`. A sticker carries its own white border and printed
// shadow, so one file reads on both the paper and the dark ground and there is
// no dark twin the way a crayon sprite has one. `spot` names a placement:
// `hero` floats one past the corner of the landing title, `callout` sits one on
// the corner of a callout, `pager` puts one in the footer doodle strip.
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

	<img
		class={spot ? 'sticker is-' + spot : 'sticker'}
		src={'/markless/stickers/' + name + '.png'}
		alt={label}
		aria-hidden={hidden}
		style={'--sticker-size:' + (size ?? '3rem')}
		decoding="async"
	/>
}
