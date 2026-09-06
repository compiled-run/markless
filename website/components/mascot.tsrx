// One of the four compiled.run mascots, cut out of `mascots.png` by
// `tooling/cut-sprites.ts`. Each sticker carries its own white outline, so one
// file reads on both the paper and the dark ground and there is no dark variant.
// `variant` names a placement: `hero` floats it beside the landing title, `mark`
// sits it above the sidebar links.
export default function Mascot({
	name,
	size,
	alt,
	variant,
}: {
	readonly name: string;
	readonly size?: string;
	readonly alt?: string;
	readonly variant?: string;
}) @{
	const label = alt ?? '';
	const hidden = label === '' ? 'true' : 'false';

	<img
		class={variant ? 'mascot is-' + variant : 'mascot'}
		src={'/markless/mascots/' + name + '.png'}
		alt={label}
		aria-hidden={hidden}
		style={'--mascot-size:' + (size ?? '6rem')}
		decoding="async"
	/>
}
