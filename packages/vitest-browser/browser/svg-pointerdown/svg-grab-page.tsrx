import { computed, state } from '@markless/core';

const SQUARES: Record<string, number> = { bk: 10, wp: 40, wn: 70 };

export default function SvgGrabPage() @{
	let hover = state('');
	let held = state('');
	let picked = state('wn');
	let touched = state(false);
	let fromX = state(0);
	let grabs = state(0);
	const bkPlace = computed(() => 'transform:translate(' + (held === 'bk' ? 1 : 0) + 'px,0px)');
	const wpPlace = computed(() => 'transform:translate(' + (held === 'wp' ? 1 : 0) + 'px,0px)');

	const grab = (id: string, event: PointerEvent) => {
		touched = true;
		held = id;
		picked = id;
		fromX = event.clientX;
		grabs = grabs + 1;
	};

	<figure>
		<button type="button" data-testid="stage" onClick={() => (touched = true)}>
			<svg
				viewBox="0 0 100 40"
				width="400"
				height="160"
				aria-hidden="true"
				onPointerup={() => (held = '')}
				onPointerleave={() => (held = '')}
			>
				<rect width="100" height="40" fill="#eee" />
				<g
					data-testid="piece-bk"
					data-hover={hover === 'bk' ? 'yes' : 'no'}
					data-held={held === 'bk' ? 'yes' : 'no'}
					data-picked={picked === 'bk' && touched ? 'yes' : 'no'}
					style={bkPlace}
					onPointerenter={() => (hover = 'bk')}
					onPointerleave={() => (hover = '')}
					onPointerdown={(event) => grab('bk', event)}
				>
					<g class="lift">
						<rect x={SQUARES.bk} y="10" width="20" height="20" fill="#333" />
					</g>
				</g>
				<g
					data-testid="piece-wp"
					data-hover={hover === 'wp' ? 'yes' : 'no'}
					data-held={held === 'wp' ? 'yes' : 'no'}
					style={wpPlace}
					onPointerenter={() => (hover = 'wp')}
					onPointerleave={() => (hover = '')}
					onPointerdown={(event) => grab('wp', event)}
				>
					<g class="lift">
						<rect x={SQUARES.wp} y="10" width="20" height="20" fill="#333" />
					</g>
				</g>
			</svg>
		</button>
		<output data-testid="hover">{hover}</output>
		<output data-testid="held">{held}</output>
		<output data-testid="grabs">{grabs}</output>
		<output data-testid="from-x">{fromX}</output>
	</figure>
}
