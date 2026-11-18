import { state } from '@markless/core';

const PIECES = [
	{ key: 'bk', x: 10 },
	{ key: 'wp', x: 40 },
	{ key: 'wn', x: 70 },
];

export default function SvgPressPage() @{
	let hover = state('');
	let downs = state(0);
	let last = state('');
	let lone = state(0);

	<main>
		<svg data-testid="board" viewBox="0 0 100 40" width="400" height="160">
			<rect width="100" height="40" fill="#eee" />
			@for (const piece of PIECES; key piece.key) {
				<g
					data-testid={'piece-' + piece.key}
					data-hover={hover === piece.key ? 'yes' : 'no'}
					onPointerDown={() => {
						downs = downs + 1;
						last = piece.key;
					}}
					onPointerEnter={() => (hover = piece.key)}
					onPointerLeave={() => (hover = '')}
				>
					<rect x={piece.x} y="10" width="20" height="20" fill="#333" />
				</g>
			}
			<g
				data-testid="lone"
				onPointerDown={() => (lone = lone + 1)}
				onPointerEnter={() => (hover = 'lone')}
				onPointerLeave={() => (hover = '')}
			>
				<circle cx="95" cy="5" r="4" fill="#900" />
			</g>
		</svg>
		<output data-testid="hover">{hover}</output>
		<output data-testid="downs">{downs}</output>
		<output data-testid="last">{last}</output>
		<output data-testid="lone-downs">{lone}</output>
	</main>
}
