// One seatmap.tsrx and three hosts: drag the file onto the browser, the phone or the server, and each draws the same plan in its own way.
import { computed, state } from '@markless/core';
import { describeHost, describeSeat, type Host, HOST_NOTE, ONE_FILE, SEATS, START_SAID, TAKEN } from './model.ts';
import { nearestTarget } from '../how/toy.ts';
import { art } from './seatmap.art.ts';

export default function SeatAnatomy() @{
	let onBrowser = state(false);
	let onPhone = state(false);
	let onTerminal = state(false);
	let seatB = state('A2');
	let seatP = state('A2');
	let said = state(START_SAID);
	let hover = state('');
	let touched = state(false);
	let held = state(false);
	let dragX = state(0);
	let dragY = state(0);
	let fromX = state(0);
	let fromY = state(0);
	let ratio = state(1);
	let dropped = state(0);
	let wobble = state('rest');
	const fileStyle = computed(() => 'transform:translate(' + (held ? dragX : 0) + 'px,' + (held ? dragY : 0) + 'px)');
	const caption = computed(() => {
		if (hover === 'file') return 'seatmap.tsrx: one file, planned at compile time for every host';
		if (hover === 'browser' || hover === 'phone' || hover === 'terminal') return HOST_NOTE[hover as Host] + ((hover === 'browser' ? onBrowser : hover === 'phone' ? onPhone : onTerminal) ? ', the same plan' : ', waiting for the plan');
		if (hover.startsWith('b:') || hover.startsWith('p:')) return TAKEN.includes(hover.slice(2) as 'A3') ? 'seat ' + hover.slice(2) + ' is taken' : 'seat ' + hover.slice(2) + ': press to pick it';
		return 'Drag the file onto a host, or press. Then pick a seat.';
	});
	const deliver = (host: Host) => {
		if (host === 'browser') onBrowser = true;
		if (host === 'phone') onPhone = true;
		if (host === 'terminal') onTerminal = true;
		said = describeHost(host);
	};
	const next = () => {
		if (!onBrowser) deliver('browser');
		else if (!onPhone) deliver('phone');
		else if (!onTerminal) deliver('terminal');
		else said = 'All three hosts have the same plan. Pick a seat in the browser or on the phone.';
	};
	const pick = (key: string) => {
		const seat = key.slice(2);
		if (TAKEN.includes(seat as 'A3')) {
			said = 'Seat ' + seat + ' is taken.';
			return;
		}
		if (key.startsWith('b:') && onBrowser) {
			seatB = seat;
			said = describeSeat('browser', seat);
		}
		if (key.startsWith('p:') && onPhone) {
			seatP = seat;
			said = describeSeat('phone', seat);
		}
	};
	const reset = () => {
		onBrowser = false;
		onPhone = false;
		onTerminal = false;
		seatB = 'A2';
		seatP = 'A2';
		said = START_SAID;
	};
	const keyOf = (target: EventTarget | null) => (target as Element | null)?.closest?.('[data-key]')?.getAttribute('data-key') ?? '';

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let seen = true;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen || touched) return;
				hover = hover === 'file' ? '' : 'file';
			}, 1800);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
	>
		<button
			type="button"
			class="stage"
			aria-label="One seat-map file and three hosts. Drag the file onto a host or press to send it to the next one; then press a seat. Keys 1, 2 and 3 send it to the browser, phone and server; left and right arrows pick a browser seat, up and down a phone seat; Escape starts again."
			onClick={(event) => {
				if (Date.now() - dropped < 400) return;
				touched = true;
				const key = keyOf(event.target);
				if (key === 'file') {
					said = ONE_FILE;
					wobble = wobble === 'odd' ? 'even' : 'odd';
				} else if (key.startsWith('b:') || key.startsWith('p:')) pick(key);
				else if (key === 'browser' || key === 'phone' || key === 'terminal') deliver(key);
				else next();
			}}
			onKeyDown={(event) => {
				touched = true;
				if (event.key === '1') deliver('browser');
				if (event.key === '2') deliver('phone');
				if (event.key === '3') deliver('terminal');
				if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') && (onBrowser || onPhone)) {
					event.preventDefault();
					const onB = (event.key === 'ArrowLeft' || event.key === 'ArrowRight') ? onBrowser : !onPhone;
					const current = onB ? seatB : seatP;
					const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
					let at = SEATS.indexOf(current as (typeof SEATS)[number]);
					do at = (at + step + SEATS.length) % SEATS.length;
					while (TAKEN.includes(SEATS[at] as 'A3'));
					pick((onB ? 'b:' : 'p:') + SEATS[at]);
				}
				if (event.key === 'Escape') reset();
			}}
		>
			<svg
				class="scene"
				data-wobble={wobble}
				viewBox={'0 0 ' + art.width + ' ' + art.height}
				aria-hidden="true"
				onPointerover={(event) => {
					touched = true;
					const key = keyOf(event.target);
					if (key) hover = key;
				}}
				onPointerdown={(event) => {
					if (keyOf(event.target) !== 'file') return;
					touched = true;
					held = true;
					fromX = event.clientX;
					fromY = event.clientY;
					dragX = 0;
					dragY = 0;
					const box = (event.target as Element | null)?.closest?.('svg')?.getBoundingClientRect();
					ratio = box && box.width > 0 ? art.width / box.width : 1;
				}}
				onPointermove={(event) => {
					if (!held) return;
					dragX = (event.clientX - fromX) * ratio;
					dragY = (event.clientY - fromY) * ratio;
				}}
				onPointerup={() => {
					if (!held) return;
					if (Math.hypot(dragX, dragY) > 6) {
						const target = nearestTarget(art.targets, art.fileAnchor[0] + dragX, art.fileAnchor[1] + dragY, 160);
						if (target === 'browser' || target === 'phone' || target === 'terminal') deliver(target);
						else said = 'Drop the file on a host: the browser, the phone or the server.';
						dropped = Date.now();
					}
					held = false;
					dragX = 0;
					dragY = 0;
				}}
				onPointercancel={() => {
					held = false;
					dragX = 0;
					dragY = 0;
				}}
				onPointerleave={(event) => {
					held = false;
					if (event.pointerType !== 'touch') hover = '';
				}}
			>
				@for (const layer of art.layers; key layer.key) {
					<path class={layer.cls} d={layer.d} />
				}
				@for (const words of art.words; key words.key) {
					<text class={words.cls} transform={words.matrix}>{words.text}</text>
				}
				<path class="hit host-hit" data-key="browser" d={art.hosts.browser} />
				<path class="hit host-hit" data-key="phone" d={art.hosts.phone} />
				<path class="hit host-hit" data-key="terminal" d={art.hosts.terminal} />
				<g class="host" data-on={onBrowser ? 'yes' : 'no'}>
					<text class="print title" x={art.titles.browser.x} y={art.titles.browser.y}>Pick a seat</text>
					@for (const seat of art.browserSeats; key seat.key) {
						<g class="seat" data-key={'b:' + seat.key} data-taken={TAKEN.includes(seat.key as 'A3') ? 'yes' : 'no'} data-picked={seatB === seat.key ? 'yes' : 'no'}>
							<path class="paper" d={seat.poly} />
							<path class="wash yellow pick" d={seat.spot} />
							<path class="ink" d={seat.ink} />
							<text class="label" x={seat.x} y={seat.y}>{seat.key}</text>
						</g>
					}
				</g>
				<text class="pencil-text waiting" data-on={onBrowser ? 'yes' : 'no'} x={art.empty.browser.x} y={art.empty.browser.y}>waiting for the plan</text>
				<g class="host" data-on={onPhone ? 'yes' : 'no'}>
					<text class="print title small" x={art.titles.phone.x} y={art.titles.phone.y}>Seats</text>
					@for (const seat of art.phoneSeats; key seat.key) {
						<g class="seat" data-key={'p:' + seat.key} data-taken={TAKEN.includes(seat.key as 'A3') ? 'yes' : 'no'} data-picked={seatP === seat.key ? 'yes' : 'no'}>
							<path class="paper" d={seat.poly} />
							<path class="wash yellow pick" d={seat.spot} />
							<path class="ink" d={seat.ink} />
							<text class="label small" x={seat.x} y={seat.y}>{seat.key}</text>
						</g>
					}
				</g>
				<text class="pencil-text waiting" data-on={onPhone ? 'yes' : 'no'} x={art.empty.phone.x} y={art.empty.phone.y}>waiting</text>
				<g class="host" data-on={onTerminal ? 'yes' : 'no'}>
					<text class="code term" x={art.terminalLines[0]!.x} y={art.terminalLines[0]!.y}>{'<section class="seats">'}</text>
					<text class="code term" x={art.terminalLines[1]!.x} y={art.terminalLines[1]!.y}>{'  <button>A1</button><button>A2</button>'}</text>
					<text class="code term" x={art.terminalLines[2]!.x} y={art.terminalLines[2]!.y}>{'  <button disabled>A3</button> …'}</text>
					<text class="code term" x={art.terminalLines[3]!.x} y={art.terminalLines[3]!.y}>{'</section>'}</text>
				</g>
				<text class="pencil-text waiting" data-on={onTerminal ? 'yes' : 'no'} x={art.empty.terminal.x} y={art.empty.terminal.y}>waiting for the plan</text>
				<g class="file" data-held={held ? 'yes' : 'no'} data-hover={hover === 'file' ? 'yes' : 'no'} style={fileStyle}>
					<g class="lift">
						@for (const layer of art.file.layers; key layer.key) {
							<path class={layer.cls} d={layer.d} />
						}
						@for (const words of art.file.words; key words.key) {
							<text class={words.cls} transform={words.matrix}>{words.text}</text>
						}
					</g>
					<path class="hit" data-key="file" d={art.hosts.file} />
				</g>
				<path class="desk-ink" d={art.note.arrow} />
				<text class="note" x={art.note.x} y={art.note.y}>WRITE IT ONCE</text>
			</svg>
		</button>
		<p class="hover-caption" aria-hidden="true">{caption}</p>
		<figcaption class="sr">
			A pen-and-ink drawing of one file, seatmap.tsrx, beside three hosts: a browser window, a phone marked early proof, and a server
			terminal. Drag the file onto a host, press a host, or press 1, 2 or 3: the browser draws the seat map as a web page, the phone draws
			the same seats as native buttons, and the server prints the HTML it sends. Then press a seat in the browser or on the phone to pick
			it; seats A3 and B1 are taken. Press the file itself and it wobbles: there is one file, planned at compile time for every host.
			Escape starts again.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
				container: anatomy / inline-size;
			}

			.stage {
				display: block;
				width: 100%;
				padding: 0;
				border: 0;
				background: none;
				color: inherit;
				cursor: pointer;
				border-radius: 12px;
			}

			.stage:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 4px;
			}

			.scene {
				touch-action: none;
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--sheet-ink: var(--ink);
				--shade-fill: color-mix(in oklch, var(--ink) 20%, transparent);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
					--shade-fill: rgb(0 0 0 / 0.5);
				}
			}

			.paper {
				fill: var(--sheet);
			}

			.kraft-fill {
				fill: color-mix(in oklch, var(--sheet) 70%, oklch(72% 0.07 65));
			}

			.ink {
				fill: var(--sheet-ink);
			}

			.faint {
				opacity: 0.55;
			}

			.hatch {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.7;
				stroke-linecap: round;
			}

			.light {
				opacity: 0.55;
			}

			.shadow {
				fill: var(--shade-fill);
			}

			.desk-hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.4;
			}

			.desk-ink {
				fill: var(--ink);
			}

			.wash {
				stroke-width: 1.2;
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: normal;
				}
			}

			.yellow {
				fill: var(--yellow);
				stroke: var(--yellow);
				opacity: 0.85;
			}

			.pool {
				fill: color-mix(in oklch, var(--yellow) 70%, oklch(70% 0.16 70));
				stroke: none;
				opacity: 0.5;
			}

			.pink {
				fill: var(--pink);
				stroke: var(--pink);
				opacity: 0.6;
			}

			.pencil {
				fill: none;
				stroke: color-mix(in srgb, var(--pink) 70%, #e0603c);
				stroke-width: 0.8;
				stroke-linecap: round;
				opacity: 0.6;
			}

			.print,
			.label {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 5px;
				font-weight: 600;
				fill: var(--sheet-ink);
			}

			.title {
				font-size: 5.6px;
				font-weight: 800;
			}

			.label {
				font-size: 4.4px;
				font-weight: 700;
			}

			.hand {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 5.4px;
				fill: var(--sheet-ink);
			}

			.pencil-text {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 4.6px;
				fill: color-mix(in srgb, var(--pink) 70%, #e0603c);
			}

			.note {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 13px;
				letter-spacing: 0.16em;
				fill: var(--ink);
			}

			.cue {
				opacity: 0;
				transition: opacity 450ms ease;
			}

			.scene[data-on='yes'] .cue {
				opacity: 1;
			}

			@container anatomy (max-width: 520px) {
				.note {
					font-size: 21px;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.scene * {
					animation: none !important;
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

			.code {
				font-family: var(--font-mono);
				font-size: 4.4px;
				font-variation-settings: 'MONO' 1;
				fill: var(--sheet-ink);
			}

			.hover-caption {
				margin: 0.3rem 0 0;
				min-height: 1.4em;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 0.95rem;
				text-align: center;
				color: var(--ink);
			}

			.hit {
				fill: transparent;
				cursor: pointer;
			}

			.url {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 9px;
				fill: var(--sheet-ink);
				opacity: 0.8;
			}

			.scene .print,
			.scene .label {
				font-size: 13px;
			}

			.scene .big {
				font-size: 20px;
			}

			.scene .title {
				font-size: 14px;
			}

			.scene .code {
				font-size: 12px;
			}

			.scene .hand {
				font-size: 14px;
			}

			.scene .pencil-text {
				font-size: 12px;
			}

			.glow,
			.spot-on {
				opacity: 0;
				transition: opacity 250ms ease;
			}

			.spot-on[data-on='yes'] {
				opacity: 0.8;
			}

			.term-paper {
				fill: oklch(27% 0.012 60);
			}

			.scene .code.term,
			.scene .term-title {
				font-size: 11px;
				fill: oklch(92% 0.03 85);
			}

			.scene .file-code {
				font-size: 9px;
			}

			.scene .file-name {
				font-size: 10px;
			}

			.host,
			.waiting {
				transition: opacity 350ms ease;
			}

			.host[data-on='no'],
			.waiting[data-on='yes'] {
				opacity: 0;
			}

			.seat {
				cursor: pointer;
			}

			.pick {
				opacity: 0;
			}

			.seat[data-picked='yes'] .pick {
				opacity: 1;
			}

			.seat[data-taken='yes'] .paper {
				fill: color-mix(in oklch, var(--sheet-ink) 22%, var(--sheet));
			}

			.scene .small {
				font-size: 9px;
			}

			.scene .early {
				font-size: 12px;
			}

			.host[data-on='no'] .seat {
				pointer-events: none;
			}

			.host > text,
			.waiting {
				pointer-events: none;
			}

			.file {
				touch-action: none;
				cursor: grab;
				transition: transform 380ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.file[data-held='yes'] {
				cursor: grabbing;
				transition: none;
			}

			.lift {
				transition: transform 180ms ease;
			}

			.file[data-hover='yes'] .lift,
			.file[data-held='yes'] .lift {
				transform: translate(-2px, -6px) rotate(-1deg);
			}

			.scene[data-wobble='odd'] .file .lift {
				animation: wob-a 450ms ease;
			}

			.scene[data-wobble='even'] .file .lift {
				animation: wob-b 450ms ease;
			}

			@keyframes wob-a {
				25% {
					transform: rotate(-4deg);
				}

				75% {
					transform: rotate(4deg);
				}
			}

			@keyframes wob-b {
				25% {
					transform: rotate(-4deg);
				}

				75% {
					transform: rotate(4deg);
				}
			}
		</style>
	</figure>
}
