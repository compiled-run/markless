// A vending machine whose selection buttons are the files in api/: drop the request's coin in GET or POST, and only the file that matches lights and drops its answer.
import { state } from '@markless/core';
import {
	describeVend,
	flip,
	GET_FILE,
	GET_FN,
	GET_ROUTE,
	getAnswer,
	keyed,
	type Method,
	MISS_STATUS,
	pathOf,
	POST_ANSWER,
	POST_FILE,
	POST_FN,
	POST_ROUTE,
	resolve,
	type Result,
	START_ID,
} from './model.ts';
import { art } from './vending.art.ts';

export default function VendingAnatomy() @{
	let id = state(START_ID);
	let method = state('GET');
	let result = state<Result>('none');
	let answer = state('');
	let beat = state('rest');
	let dragX = state(0);
	let dragY = state(0);
	let dragging = state(false);
	let said = state('');
	const insert = (into: Method) => {
		method = into;
		result = resolve(into, id);
		answer = result === 'post' ? POST_ANSWER : getAnswer(id);
		beat = flip(beat);
		said = describeVend(into, id, result);
	};
	const press = (label: string) => {
		if (label) id = keyed(id, label);
	};
	const reset = () => {
		id = START_ID;
		result = 'none';
		beat = 'rest';
		said = '';
	};
	const scaleOf = (event: Event) => {
		const svg = (event.currentTarget as SVGGraphicsElement).ownerSVGElement;
		const width = svg?.getBoundingClientRect().width ?? art.width;
		return art.width / (width || art.width);
	};

	<figure
		class="anatomy"
		onKeyDown={(event) => {
			if (event.key === 'Escape') reset();
		}}
	>
		<svg class="scene" data-result={result} data-beat={beat} data-method={method} viewBox={'0 0 ' + art.width + ' ' + art.height}>
			<path class="cast" d={art.cabinet.cast} />
			<path class="hatch deep light" d={art.cabinet.castHatch} />
			<path class="body" d={art.cabinet.side} />
			<path class="body" d={art.cabinet.top} />
			<path class="body" d={art.cabinet.front} />
			<path class="m-hatch" d={art.cabinet.shade} />
			<path class="glass" d={art.cabinet.glass} />
			<path class="m-hatch faint" d={art.cabinet.glassHatch} />

			<g class="shelf get">
				<path class="m-ink coil" d={art.shelves[0]!.coil} style={art.shelves[0]!.pitch} />
				<path class="metal" d={art.shelves[0]!.shelf} />
				<path class="m-ink" d={art.shelves[0]!.shelfInk} />
				<g class="card" style={art.shelves[0]!.drop}>
					<path class="paper" d={art.shelves[0]!.card} />
					<path class="m-ink" d={art.shelves[0]!.cardInk} />
				</g>
			</g>
			<g class="shelf post">
				<path class="m-ink coil" d={art.shelves[1]!.coil} style={art.shelves[1]!.pitch} />
				<path class="metal" d={art.shelves[1]!.shelf} />
				<path class="m-ink" d={art.shelves[1]!.shelfInk} />
				<g class="card" style={art.shelves[1]!.drop}>
					<path class="paper" d={art.shelves[1]!.card} />
					<path class="m-ink" d={art.shelves[1]!.cardInk} />
				</g>
			</g>
			<path class="m-ink glare" d={art.cabinet.glare} />

			<g class="file get" tabindex="0" role="group" aria-label={GET_ROUTE + ', the file ' + GET_FILE + '. It runs ' + GET_FN}>
				<path class="paper" d={art.shelves[0]!.plate} />
				<path class="wash yellow lit" d={art.shelves[0]!.lightWash} />
				<path class="m-ink" d={art.shelves[0]!.plateInk} />
				<path class="lamp" d={art.shelves[0]!.light} />
				<path class="m-ink" d={art.shelves[0]!.lightInk} />
				<text class="route" x={art.shelves[0]!.route.x} y={art.shelves[0]!.route.y}>{GET_ROUTE}</text>
				<text class="filename" x={art.shelves[0]!.file.x} y={art.shelves[0]!.file.y}>{GET_FILE}</text>
			</g>
			<g class="file post" tabindex="0" role="group" aria-label={POST_ROUTE + ', the file ' + POST_FILE + '. It runs ' + POST_FN}>
				<path class="paper" d={art.shelves[1]!.plate} />
				<path class="wash yellow lit" d={art.shelves[1]!.lightWash} />
				<path class="m-ink" d={art.shelves[1]!.plateInk} />
				<path class="lamp" d={art.shelves[1]!.light} />
				<path class="m-ink" d={art.shelves[1]!.lightInk} />
				<text class="route" x={art.shelves[1]!.route.x} y={art.shelves[1]!.route.y}>{POST_ROUTE}</text>
				<text class="filename" x={art.shelves[1]!.file.x} y={art.shelves[1]!.file.y}>{POST_FILE}</text>
			</g>

			<path class="screen" d={art.panel.display} />
			<path class="m-ink" d={art.panel.displayInk} />
			<text class="display" x={art.panel.displayText.x} y={art.panel.displayText.y}>{pathOf(id)}</text>

			<g
				class="keypad"
				tabindex="0"
				role="group"
				aria-label={'Keypad. The id is ' + (id || 'empty') + '. Type digits, Backspace to delete, C to clear.'}
				onKeyDown={(event) => {
					if (
						event.key === '0' || event.key === '1' || event.key === '2' || event.key === '3' || event.key === '4' || event.key === '5' || event.key === '6' || event.key === '7' || event.key === '8' || event.key === '9' ||
						event.key === 'Backspace' ||
						event.key === 'c' ||
						event.key === 'C'
					) {
						event.preventDefault();
						press(event.key === 'c' ? 'C' : event.key);
					}
				}}
			>
				<path class="metal" d={art.panel.keypad} />
				<path class="m-ink" d={art.panel.keypadInk} />
				<g class="key" data-key="0" onClick={() => press(art.panel.keys[0]!.label)}>
					<path class="key-face" d={art.panel.keys[0]!.paper} />
					<path class="m-ink" d={art.panel.keys[0]!.ink} />
					<text class="key-text" x={art.panel.keys[0]!.x} y={art.panel.keys[0]!.y}>{art.panel.keys[0]!.label}</text>
				</g>
				<g class="key" data-key="1" onClick={() => press(art.panel.keys[1]!.label)}>
					<path class="key-face" d={art.panel.keys[1]!.paper} />
					<path class="m-ink" d={art.panel.keys[1]!.ink} />
					<text class="key-text" x={art.panel.keys[1]!.x} y={art.panel.keys[1]!.y}>{art.panel.keys[1]!.label}</text>
				</g>
				<g class="key" data-key="2" onClick={() => press(art.panel.keys[2]!.label)}>
					<path class="key-face" d={art.panel.keys[2]!.paper} />
					<path class="m-ink" d={art.panel.keys[2]!.ink} />
					<text class="key-text" x={art.panel.keys[2]!.x} y={art.panel.keys[2]!.y}>{art.panel.keys[2]!.label}</text>
				</g>
				<g class="key" data-key="3" onClick={() => press(art.panel.keys[3]!.label)}>
					<path class="key-face" d={art.panel.keys[3]!.paper} />
					<path class="m-ink" d={art.panel.keys[3]!.ink} />
					<text class="key-text" x={art.panel.keys[3]!.x} y={art.panel.keys[3]!.y}>{art.panel.keys[3]!.label}</text>
				</g>
				<g class="key" data-key="4" onClick={() => press(art.panel.keys[4]!.label)}>
					<path class="key-face" d={art.panel.keys[4]!.paper} />
					<path class="m-ink" d={art.panel.keys[4]!.ink} />
					<text class="key-text" x={art.panel.keys[4]!.x} y={art.panel.keys[4]!.y}>{art.panel.keys[4]!.label}</text>
				</g>
				<g class="key" data-key="5" onClick={() => press(art.panel.keys[5]!.label)}>
					<path class="key-face" d={art.panel.keys[5]!.paper} />
					<path class="m-ink" d={art.panel.keys[5]!.ink} />
					<text class="key-text" x={art.panel.keys[5]!.x} y={art.panel.keys[5]!.y}>{art.panel.keys[5]!.label}</text>
				</g>
				<g class="key" data-key="6" onClick={() => press(art.panel.keys[6]!.label)}>
					<path class="key-face" d={art.panel.keys[6]!.paper} />
					<path class="m-ink" d={art.panel.keys[6]!.ink} />
					<text class="key-text" x={art.panel.keys[6]!.x} y={art.panel.keys[6]!.y}>{art.panel.keys[6]!.label}</text>
				</g>
				<g class="key" data-key="7" onClick={() => press(art.panel.keys[7]!.label)}>
					<path class="key-face" d={art.panel.keys[7]!.paper} />
					<path class="m-ink" d={art.panel.keys[7]!.ink} />
					<text class="key-text" x={art.panel.keys[7]!.x} y={art.panel.keys[7]!.y}>{art.panel.keys[7]!.label}</text>
				</g>
				<g class="key" data-key="8" onClick={() => press(art.panel.keys[8]!.label)}>
					<path class="key-face" d={art.panel.keys[8]!.paper} />
					<path class="m-ink" d={art.panel.keys[8]!.ink} />
					<text class="key-text" x={art.panel.keys[8]!.x} y={art.panel.keys[8]!.y}>{art.panel.keys[8]!.label}</text>
				</g>
				<g class="key" data-key="9" onClick={() => press(art.panel.keys[9]!.label)}>
					<path class="key-face" d={art.panel.keys[9]!.paper} />
					<path class="m-ink" d={art.panel.keys[9]!.ink} />
					<text class="key-text" x={art.panel.keys[9]!.x} y={art.panel.keys[9]!.y}>{art.panel.keys[9]!.label}</text>
				</g>
				<g class="key" data-key="10" onClick={() => press(art.panel.keys[10]!.label)}>
					<path class="key-face" d={art.panel.keys[10]!.paper} />
					<path class="m-ink" d={art.panel.keys[10]!.ink} />
					<text class="key-text" x={art.panel.keys[10]!.x} y={art.panel.keys[10]!.y}>{art.panel.keys[10]!.label}</text>
				</g>
				<g class="key" data-key="11" onClick={() => press(art.panel.keys[11]!.label)}>
					<path class="key-face" d={art.panel.keys[11]!.paper} />
					<path class="m-ink" d={art.panel.keys[11]!.ink} />
					<text class="key-text" x={art.panel.keys[11]!.x} y={art.panel.keys[11]!.y}>{art.panel.keys[11]!.label}</text>
				</g>
			</g>

			<g
				class="slot get"
				tabindex="0"
				role="button"
				aria-label="Drop the coin in the GET slot"
				onClick={() => insert('GET')}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						insert('GET');
					}
				}}
			>
				<path class="metal" d={art.panel.get.plate} />
				<path class="slit" d={art.panel.get.slit} />
				<path class="m-ink" d={art.panel.get.ink} />
				<text class="slot-text" x={art.panel.get.label.x} y={art.panel.get.label.y}>GET</text>
			</g>
			<g
				class="slot post"
				tabindex="0"
				role="button"
				aria-label="Drop the coin in the POST slot"
				onClick={() => insert('POST')}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						insert('POST');
					}
				}}
			>
				<path class="metal" d={art.panel.post.plate} />
				<path class="slit" d={art.panel.post.slit} />
				<path class="m-ink" d={art.panel.post.ink} />
				<text class="slot-text" x={art.panel.post.label.x} y={art.panel.post.label.y}>POST</text>
			</g>

			<path class="slit" d={art.tray.tray} />
			<path class="m-hatch" d={art.tray.trayHatch} />
			<g class="tray-card">
				<path class="paper" d={art.tray.card} />
				<path class="wash yellow" d={art.tray.cardWash} />
				<path class="m-ink" d={art.tray.cardInk} />
				<text class="answer" x={art.tray.cardText.x} y={art.tray.cardText.y}>{answer}</text>
			</g>
			<path class="flap" d={art.tray.flap} />
			<path class="m-ink" d={art.tray.flapInk} />
			<path class="m-ink" d={art.tray.trayInk} />

			<path class="slit" d={art.tray.cup} />
			<path class="m-hatch" d={art.tray.cupHatch} />
			<g class="cup-coin">
				<path class="brass" d={art.tray.coin} />
				<path class="m-ink" d={art.tray.coinInk} />
			</g>
			<path class="m-ink" d={art.tray.cupInk} />
			<g class="tag">
				<path class="paper" d={art.tray.tag} />
				<path class="m-ink" d={art.tray.tagInk} />
				<text class="status" x={art.tray.tagText.x} y={art.tray.tagText.y}>{MISS_STATUS}</text>
			</g>

			<path class="m-ink" d={art.cabinet.ink} />
			<text class="fn cap-get" x={art.caption.x} y={art.caption.y}>{GET_FILE + ': ' + GET_FN}</text>
			<text class="fn cap-post" x={art.caption.x} y={art.caption.y}>{POST_FILE + ': ' + POST_FN}</text>

			<g
				class="coin"
				tabindex="0"
				role="button"
				aria-label="The request's coin. Drag it to a slot, or press G or P."
				data-dragging={dragging ? '' : undefined}
				style={dragging ? 'transform: translate(' + dragX + 'px, ' + dragY + 'px)' : method === 'POST' ? art.coin.toPost : art.coin.toGet}
				onPointerdown={(event) => {
					const el = event.currentTarget as SVGGElement;
					el.setPointerCapture(event.pointerId);
					el.dataset.x = String(event.clientX);
					el.dataset.y = String(event.clientY);
					dragX = 0;
					dragY = 0;
					dragging = true;
				}}
				onPointermove={(event) => {
					const el = event.currentTarget as SVGGElement;
					if (el.dataset.x === undefined) return;
					const k = scaleOf(event);
					dragX = (event.clientX - Number(el.dataset.x)) * k;
					dragY = (event.clientY - Number(el.dataset.y)) * k;
				}}
				onPointerup={(event) => {
					delete (event.currentTarget as SVGGElement).dataset.x;
					const x = art.coin.at[0] + dragX;
					const y = art.coin.at[1] + dragY;
					const toGet = Math.hypot(x - art.slots.GET.x, y - art.slots.GET.y);
					const toPost = Math.hypot(x - art.slots.POST.x, y - art.slots.POST.y);
					dragging = false;
					dragX = 0;
					dragY = 0;
					if (Math.min(toGet, toPost) < 48) insert(toGet < toPost ? 'GET' : 'POST');
				}}
				onPointercancel={(event) => {
					delete (event.currentTarget as SVGGElement).dataset.x;
					dragging = false;
					dragX = 0;
					dragY = 0;
				}}
				onKeyDown={(event) => {
					if (event.key === 'g' || event.key === 'G' || event.key === 'Enter') {
						event.preventDefault();
						insert('GET');
					}
					if (event.key === 'p' || event.key === 'P') {
						event.preventDefault();
						insert('POST');
					}
				}}
			>
				<g class="coin-lift">
					<path class="hatch deep light" d={art.coin.shadow} />
					<path class="brass" d={art.coin.paper} />
					<path class="wash brass-wash" d={art.coin.wash} />
					<path class="m-hatch faint" d={art.coin.shade} />
					<path class="m-ink" d={art.coin.ink} />
				</g>
			</g>
		</svg>
		<figcaption class="sr">
			A pen-and-ink vending machine. Its two selection buttons are files: {GET_ROUTE}, from {GET_FILE}, and {POST_ROUTE}, from {POST_FILE}.
			Type an id on the keypad, and the display shows the path. Drop the coin in the GET slot or the POST slot. When a file matches, its button
			lights, its coil turns, and a card with the answer drops into the tray. A POST to /api/users/42 matches no file: nothing lights, and the
			coin rattles back into the return cup with {MISS_STATUS}.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				touch-action: pan-y;
				user-select: none;
				-webkit-user-select: none;
				--m-body: color-mix(in oklch, var(--paper) 55%, oklch(78% 0.05 210));
				--m-paper: color-mix(in oklch, var(--paper) 50%, white);
				--m-metal: color-mix(in oklch, var(--paper) 65%, oklch(72% 0.01 250));
				--m-ink: var(--ink);
				--m-slit: color-mix(in oklch, var(--ink) 82%, transparent);
				--m-brass: color-mix(in oklch, var(--paper) 45%, oklch(76% 0.11 85));
				--m-shade: color-mix(in oklch, var(--ink) 22%, transparent);

				html.dark & {
					--m-body: color-mix(in oklch, var(--ink) 80%, oklch(78% 0.05 210));
					--m-paper: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--m-metal: color-mix(in oklch, var(--ink) 78%, oklch(72% 0.01 250));
					--m-ink: var(--paper);
					--m-slit: color-mix(in oklch, var(--paper) 85%, transparent);
					--m-brass: color-mix(in oklch, var(--ink) 60%, oklch(76% 0.11 85));
					--m-shade: rgb(0 0 0 / 0.5);
				}
			}

			.body {
				fill: var(--m-body);
			}

			.paper {
				fill: var(--m-paper);
			}

			.metal {
				fill: var(--m-metal);
			}

			.glass {
				fill: color-mix(in oklch, var(--m-paper) 70%, oklch(85% 0.03 220));
			}

			.screen {
				fill: color-mix(in oklch, var(--m-slit) 90%, oklch(60% 0.08 150));
			}

			.slit {
				fill: var(--m-slit);
			}

			.flap {
				fill: color-mix(in oklch, var(--m-metal) 80%, transparent);
			}

			.brass {
				fill: var(--m-brass);
			}

			.lamp {
				fill: var(--m-paper);
			}

			.cast {
				fill: var(--m-shade);
			}

			.m-ink {
				fill: var(--m-ink);
			}

			.m-hatch,
			.hatch {
				fill: none;
				stroke: var(--m-ink);
				stroke-width: 0.7;
				stroke-linecap: round;
			}

			.deep {
				stroke: var(--ink);
			}

			.light {
				opacity: 0.45;
			}

			.faint {
				opacity: 0.3;
			}

			.wash {
				mix-blend-mode: multiply;
			}

			.yellow {
				fill: var(--yellow);
			}

			.brass-wash {
				fill: oklch(76% 0.11 85);
				opacity: 0.4;
			}

			.route,
			.filename,
			.fn,
			.display,
			.key-text,
			.slot-text,
			.answer,
			.status {
				fill: var(--m-ink);
			}

			.route,
			.slot-text,
			.status {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-weight: 800;
			}

			.route {
				font-size: 15px;
			}

			.filename,
			.fn,
			.display,
			.key-text,
			.answer {
				font-family: var(--font-mono, ui-monospace, monospace);
			}

			.filename {
				font-size: 10px;
				opacity: 0.8;
			}

			.fn {
				font-size: 12px;
			}

			.display {
				font-size: 9.5px;
				fill: oklch(92% 0.12 150);
			}

			.key-text {
				font-size: 9px;
				text-anchor: middle;
			}

			.slot-text {
				font-size: 11px;
			}

			.answer {
				font-size: 13px;
				font-weight: 700;
				text-anchor: middle;
			}

			.status {
				font-size: 13px;
				text-anchor: middle;
			}

			.key-face {
				fill: var(--m-paper);
			}

			.key {
				cursor: pointer;
			}

			.key:hover .key-face {
				fill: color-mix(in oklch, var(--m-paper) 80%, var(--yellow));
			}

			.key:active {
				transform: translateY(1px);
			}

			.file,
			.slot,
			.keypad,
			.coin {
				outline: none;
			}

			.file > *,
			.slot > *,
			.coin-lift {
				transform-box: fill-box;
				transition: transform 160ms ease;
			}

			.slot {
				cursor: pointer;
			}

			.file:hover > *,
			.file:focus-visible > * {
				transform: translateY(-2px);
			}

			.cap-get,
			.cap-post {
				opacity: 0;
				transition: opacity 160ms ease;
			}

			.scene:has(.file.get:hover, .file.get:focus-visible) .cap-get,
			.scene:has(.file.post:hover, .file.post:focus-visible) .cap-post {
				opacity: 1;
			}

			.slot:hover > *,
			.slot:focus-visible > * {
				transform: translateY(-2px);
			}

			.coin {
				cursor: grab;
			}

			.coin[data-dragging] {
				cursor: grabbing;
			}

			.coin:hover .coin-lift,
			.coin:focus-visible .coin-lift {
				transform: translateY(-4px) rotate(-8deg);
			}

			.keypad:focus-visible .metal,
			.slot:focus-visible .metal,
			.file:focus-visible > .paper,
			.coin:focus-visible .brass {
				stroke: var(--m-ink);
				stroke-width: 1.2;
				stroke-dasharray: 4 3;
			}

			.lit,
			.tray-card,
			.cup-coin,
			.tag {
				opacity: 0;
			}

			.coil {
				transform-box: view-box;
			}

			.coin {
				transform-box: fill-box;
				transform-origin: center;
			}

			.glare {
				opacity: 0.35;
			}

			.scene[data-beat='odd'] {
				--c-in: in-a;
				--c-coil: coil-a;
				--c-drop: drop-a;
				--c-show: show-a;
				--c-rattle: rattle-a;
			}

			.scene[data-beat='even'] {
				--c-in: in-b;
				--c-coil: coil-b;
				--c-drop: drop-b;
				--c-show: show-b;
				--c-rattle: rattle-b;
			}

			.scene:not([data-beat='rest']) .coin:not([data-dragging]) {
				animation: var(--c-in) 1700ms ease-in-out both;
			}

			.scene[data-result='get'] .get .lit,
			.scene[data-result='post'] .post .lit {
				animation: var(--c-show) 300ms 550ms ease-out both;
			}

			.scene[data-result='get'] .shelf.get .coil,
			.scene[data-result='post'] .shelf.post .coil {
				animation: var(--c-coil) 600ms 700ms ease-in-out;
			}

			.scene[data-result='get'] .shelf.get .card,
			.scene[data-result='post'] .shelf.post .card {
				animation: var(--c-drop) 2200ms 1100ms ease-in both;
			}

			.scene[data-result='get'] .tray-card,
			.scene[data-result='post'] .tray-card {
				animation: var(--c-show) 200ms 1600ms ease-out both;
			}

			.scene[data-result='miss'] .cup-coin {
				animation: var(--c-rattle) 700ms 650ms ease-out both;
			}

			.scene[data-result='miss'] .tag {
				animation: var(--c-show) 260ms 1300ms ease-out both;
			}

			@keyframes in-a {
				0% {
					transform: none;
					opacity: 1;
				}
				32% {
					transform: var(--to) scale(0.5);
					opacity: 1;
				}
				34%,
				80% {
					transform: var(--to) scale(0.5);
					opacity: 0;
				}
				81% {
					transform: none;
					opacity: 0;
				}
				100% {
					transform: none;
					opacity: 1;
				}
			}

			@keyframes in-b {
				0% {
					transform: none;
					opacity: 1;
				}
				32% {
					transform: var(--to) scale(0.5);
					opacity: 1;
				}
				34%,
				80% {
					transform: var(--to) scale(0.5);
					opacity: 0;
				}
				81% {
					transform: none;
					opacity: 0;
				}
				100% {
					transform: none;
					opacity: 1;
				}
			}

			@keyframes coil-a {
				from {
					transform: none;
				}
				to {
					transform: translateX(var(--pitch));
				}
			}

			@keyframes coil-b {
				from {
					transform: none;
				}
				to {
					transform: translateX(var(--pitch));
				}
			}

			@keyframes drop-a {
				0% {
					transform: none;
					opacity: 1;
				}
				22% {
					transform: translateY(var(--drop-y));
					opacity: 1;
				}
				23%,
				85% {
					transform: none;
					opacity: 0;
				}
				100% {
					transform: none;
					opacity: 1;
				}
			}

			@keyframes drop-b {
				0% {
					transform: none;
					opacity: 1;
				}
				22% {
					transform: translateY(var(--drop-y));
					opacity: 1;
				}
				23%,
				85% {
					transform: none;
					opacity: 0;
				}
				100% {
					transform: none;
					opacity: 1;
				}
			}

			@keyframes show-a {
				from {
					opacity: 0;
				}
				to {
					opacity: 1;
				}
			}

			@keyframes show-b {
				from {
					opacity: 0;
				}
				to {
					opacity: 1;
				}
			}

			@keyframes rattle-a {
				0% {
					opacity: 0;
					transform: translateY(-40px);
				}
				40% {
					opacity: 1;
					transform: translateY(0) rotate(0);
				}
				55% {
					transform: translateX(-3px) rotate(-8deg);
				}
				70% {
					transform: translateX(3px) rotate(6deg);
				}
				85% {
					transform: translateX(-1px) rotate(-3deg);
				}
				100% {
					opacity: 1;
					transform: none;
				}
			}

			@keyframes rattle-b {
				0% {
					opacity: 0;
					transform: translateY(-40px);
				}
				40% {
					opacity: 1;
					transform: translateY(0) rotate(0);
				}
				55% {
					transform: translateX(-3px) rotate(-8deg);
				}
				70% {
					transform: translateX(3px) rotate(6deg);
				}
				85% {
					transform: translateX(-1px) rotate(-3deg);
				}
				100% {
					opacity: 1;
					transform: none;
				}
			}

			.cup-coin {
				transform-box: fill-box;
				transform-origin: center;
			}

			@media (prefers-reduced-motion: reduce) {
				.scene *,
				.scene .coin {
					animation-duration: 1ms !important;
					animation-delay: 0ms !important;
					transition: none !important;
				}
			}

			.sr {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}
		</style>
	</figure>
}
