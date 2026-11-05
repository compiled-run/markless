// A browser window with a dark-mode switch (storage()) and a sidebar (state()): reload, and only the switch is remembered.
import { state } from '@markless/core';
import {
	CLEAR_AT,
	describeCookie,
	describeReload,
	describeSidebar,
	describeSwitch,
	flip,
	PLAIN,
	PLAIN_CAPTION,
	RELOAD_TOUR,
	reloaded,
	SAVED,
	SAVED_CAPTION,
	SITE,
	START,
} from './model.ts';
import { art } from './browser.art.ts';

export default function ReloadAnatomy() @{
	let dark = state(START.dark);
	let open = state(START.open);
	let cookie = state(START.cookie);
	let beat = state('rest');
	let nudge = state('rest');
	let dragX = state(0);
	let dragY = state(0);
	let dragging = state(false);
	let said = state('');
	let touched = state(false);
	const flipSwitch = () => {
		dark = !dark;
		cookie = true;
		said = describeSwitch(dark);
	};
	const toggleSidebar = () => {
		open = !open;
		said = describeSidebar(open);
	};
	const reload = () => {
		const before = { dark, open, cookie };
		const after = reloaded(before);
		dark = after.dark;
		open = after.open;
		beat = flip(beat);
		said = describeReload(before, after);
	};
	const setCookie = (next: boolean) => {
		cookie = next;
		said = describeCookie(next);
	};
	const resetAll = () => {
		dark = START.dark;
		open = START.open;
		cookie = START.cookie;
		beat = 'rest';
		said = 'Back to the start.';
	};
	const scaleOf = (event: Event) => {
		const svg = (event.currentTarget as SVGGraphicsElement).ownerSVGElement;
		const width = svg?.getBoundingClientRect().width ?? art.width;
		return art.width / (width || art.width);
	};

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let seen = true;
			let step = 0;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen || touched) return;
				const next = RELOAD_TOUR[step % RELOAD_TOUR.length];
				step++;
				if (next === 'dark') flipSwitch();
				if (next === 'open') toggleSidebar();
				if (next === 'reload') reload();
				if (next === 'reset') resetAll();
			}, 2200);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
		onKeyDown={(event) => {
			if (event.key === 'Escape') {
				touched = true;
				resetAll();
			}
		}}
	>
		<svg
			class="scene"
			data-dark={dark ? 'on' : 'off'}
			data-open={open ? 'on' : 'off'}
			data-cookie={cookie ? 'in' : 'out'}
			data-beat={beat}
			data-nudge={nudge}
			viewBox={'0 0 ' + art.width + ' ' + art.height}
		>
			<path class="hatch light" d={art.window.shadow} />
			<path class="leaf" d={art.window.paper} />
			<path class="pen-hatch faint" d={art.window.barTone} />
			<path class="leaf" d={art.window.pill} />
			<path class="pen" d={art.window.pillInk} />
			<text class="site" x={art.window.site.x} y={art.window.site.y}>{SITE}</text>
			<path class="hole" d={art.cookie.hole} />

			<g class="page-layer">
				<path class="page-fill" d={art.page.paper} />
				<path class="page-ink" d={art.page.rule} />
				<path class="page-ink" d={art.page.heading} />
				<path class="page-ink faint-line" d={art.page.lines} />
				<g class="sidebar">
					<path class="side-fill" d={art.sidebar.paper} />
					<path class="page-hatch" d={art.sidebar.tone} />
					<path class="page-ink" d={art.sidebar.links} />
					<path class="page-ink" d={art.sidebar.ink} />
				</g>
			</g>

			<path class="pen" d={art.window.ink} />

			<g
				class="toy menu"
				tabindex="0"
				role="button"
				aria-label="Menu. Opens and closes the sidebar, kept in state()."
				aria-pressed={open ? 'true' : 'false'}
				onClick={() => {
					touched = true;
					toggleSidebar();
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						touched = true;
						toggleSidebar();
					}
				}}
			>
				<path class="hit" d={art.page.menuHit} />
				<path class="page-ink" d={art.page.menu} />
				<path class="focus" d={art.page.menuHit} />
			</g>

			<g
				class="toy switch"
				tabindex="0"
				role="switch"
				aria-label="Dark mode, kept in storage()"
				aria-checked={dark ? 'true' : 'false'}
				onClick={() => {
					touched = true;
					flipSwitch();
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
						event.preventDefault();
						touched = true;
						if (event.key === 'ArrowLeft' && !dark) return;
						if (event.key === 'ArrowRight' && dark) return;
						flipSwitch();
					}
				}}
			>
				<path class="hit" d={art.switch.hit} />
				<path class="page-ink" d={art.switch.sun} />
				<path class="page-ink" d={art.switch.moon} />
				<path class="track" d={art.switch.track} />
				<path class="pen" d={art.switch.trackInk} />
				<g class="knob" style={'--travel:' + art.switch.travel + 'px'}>
					<path class="leaf" d={art.switch.knob} />
					<path class="pen-hatch" d={art.switch.knobShade} />
					<path class="pen" d={art.switch.knobInk} />
				</g>
				<path class="focus" d={art.switch.track} />
			</g>

			<g
				class="toy reload"
				tabindex="0"
				role="button"
				aria-label="Reload the page"
				onClick={() => {
					touched = true;
					reload();
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						touched = true;
						reload();
					}
				}}
			>
				<path class="pen" d={art.reload.side} />
				<g class="press">
					<path class="leaf" d={art.reload.paper} />
					<path class="wash pink" d={art.reload.wash} />
					<path class="pen" d={art.reload.ink} />
				</g>
			</g>

			<text class="caption saved" x={art.caption.x} y={art.caption.y}>{SAVED_CAPTION}</text>
			<text class="caption plain" x={art.caption.x} y={art.caption.y}>{PLAIN_CAPTION}</text>

			<g
				class="toy cookie"
				tabindex="0"
				role="button"
				aria-label={cookie ? 'The site cookie. Drag it out of the address bar, or press Delete, to clear site data.' : 'The cleared cookie. Drag it back, or press Enter, to restore it.'}
				data-dragging={dragging ? '' : undefined}
				style={dragging ? 'transform: translate(' + ((cookie ? 0 : art.cookie.outX) + dragX) + 'px, ' + ((cookie ? 0 : art.cookie.outY) + dragY) + 'px)' : art.cookie.out}
				onPointerdown={(event) => {
					touched = true;
					const el = event.currentTarget as SVGGElement;
					el.setPointerCapture(event.pointerId);
					el.dataset.x = String(event.clientX);
					el.dataset.y = String(event.clientY);
				}}
				onPointermove={(event) => {
					const el = event.currentTarget as SVGGElement;
					if (el.dataset.x === undefined) return;
					const k = scaleOf(event);
					const x = (event.clientX - Number(el.dataset.x)) * k;
					const y = (event.clientY - Number(el.dataset.y)) * k;
					if (!dragging && Math.hypot(x, y) < 4) return;
					dragging = true;
					dragX = x;
					dragY = y;
				}}
				onPointerup={(event) => {
					const el = event.currentTarget as SVGGElement;
					delete el.dataset.x;
					const moved = Math.hypot(dragX, dragY);
					const wasDragging = dragging;
					dragging = false;
					dragX = 0;
					dragY = 0;
					if (!wasDragging) {
						if (cookie) {
							nudge = flip(nudge);
							said = 'Drag the cookie out of the address bar to clear site data.';
						} else setCookie(true);
						return;
					}
					if (cookie && moved > CLEAR_AT) setCookie(false);
					else if (!cookie && moved > CLEAR_AT) setCookie(true);
				}}
				onPointercancel={(event) => {
					delete (event.currentTarget as SVGGElement).dataset.x;
					dragging = false;
					dragX = 0;
					dragY = 0;
				}}
				onKeyDown={(event) => {
					if (event.key === 'Delete' || event.key === 'Backspace' || event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						touched = true;
						setCookie(!cookie);
					}
				}}
			>
				<g class="cookie-body">
					<path class="biscuit" d={art.cookie.paper} />
					<path class="pen" d={art.cookie.ink} />
				</g>
			</g>
		</svg>
		<figcaption class="sr">
			A pen-and-ink browser window at {SITE}, with a pink reload arrow and a small cookie in its address bar. Inside is a page with a
			dark-mode switch, kept in {SAVED}, and a menu button that opens a sidebar, kept in {PLAIN}. Flip the switch and open the sidebar,
			then reload: the page redraws, the switch stays where you left it, and the sidebar closes. Drag the cookie out of the address bar
			to clear site data, reload, and the switch starts over too. Escape puts everything back.
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
				--pen: oklch(27% 0.012 60);
				--leaf: oklch(97.5% 0.008 85);
				--night: oklch(29% 0.02 260);
				--night-ink: oklch(90% 0.02 85);
				--page: var(--leaf);
				--page-ink: var(--pen);
				--side: color-mix(in oklch, var(--leaf) 85%, oklch(80% 0.03 80));
			}

			.scene[data-dark='on'] {
				--page: var(--night);
				--page-ink: var(--night-ink);
				--side: color-mix(in oklch, var(--night) 80%, black);
			}

			.leaf {
				fill: var(--leaf);
			}

			.pen {
				fill: var(--pen);
			}

			.pen-hatch,
			.page-hatch {
				fill: none;
				stroke: var(--pen);
				stroke-width: 0.7;
				stroke-linecap: round;
			}

			.page-hatch {
				stroke: var(--page-ink);
				opacity: 0.25;
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.75;
				stroke-linecap: round;
			}

			.light {
				opacity: 0.45;
			}

			.faint {
				opacity: 0.35;
			}

			.page-fill {
				fill: var(--page);
				transition: fill 200ms ease;
			}

			.side-fill {
				fill: var(--side);
			}

			.page-ink {
				fill: var(--page-ink);
			}

			.faint-line {
				opacity: 0.55;
			}

			.track {
				fill: var(--leaf);
			}

			.scene[data-dark='on'] .track {
				fill: color-mix(in oklch, var(--yellow) 75%, white);
			}

			.biscuit {
				fill: oklch(74% 0.08 70);
			}

			.hole {
				fill: none;
				stroke: var(--pen);
				stroke-width: 1;
				stroke-dasharray: 2.5 2.5;
				opacity: 0;
			}

			.scene[data-cookie='out'] .hole {
				opacity: 0.6;
			}

			.wash {
				mix-blend-mode: multiply;
			}

			.pink {
				fill: var(--pink);
				opacity: 0.6;
			}

			.yellow {
				fill: var(--yellow);
				opacity: 0;
			}

			.site {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--pen);
			}

			.site {
				font-size: 13px;
				font-weight: 600;
				opacity: 0.8;
			}


			.caption {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 15px;
				font-weight: 700;
				text-anchor: middle;
				fill: var(--ink);
				opacity: 0;
				transition: opacity 140ms ease;
				pointer-events: none;
			}

			.scene:has(.switch:hover, .switch:focus-visible) .caption.saved,
			.scene:has(.menu:hover, .menu:focus-visible) .caption.plain {
				opacity: 1;
			}

			.toy {
				cursor: pointer;
				outline: none;
			}


			.hit {
				fill: transparent;
			}

			.focus {
				fill: none;
				stroke: var(--pen);
				stroke-width: 1.4;
				stroke-dasharray: 4 3;
				opacity: 0;
			}

			.toy:focus-visible .focus {
				opacity: 1;
			}

			.knob {
				transition: transform 220ms cubic-bezier(0.3, 1.4, 0.5, 1);
			}

			.scene[data-dark='on'] .knob {
				transform: translateX(var(--travel));
			}


			.sidebar {
				opacity: 0;
				transform: translateX(-14px);
				transition: opacity 200ms ease, transform 220ms ease;
				pointer-events: none;
			}

			.scene[data-open='on'] .sidebar {
				opacity: 1;
				transform: none;
			}

			.menu:hover .page-ink,
			.reload:hover .press {
				transform: translateY(-1.5px);
			}

			.press {
				transition: transform 140ms ease;
			}

			.cookie {
				cursor: grab;
			}

			.cookie[data-dragging] {
				cursor: grabbing;
			}

			.cookie:not([data-dragging]) {
				transition: transform 380ms cubic-bezier(0.3, 1.3, 0.5, 1);
			}

			.scene[data-cookie='in'] .cookie:not([data-dragging]) {
				transform: none;
			}

			.scene[data-cookie='out'] .cookie:not([data-dragging]) {
				transform: translate(var(--out-x), var(--out-y));
			}

			.scene[data-cookie='out'] .cookie-body {
				transform: rotate(18deg);
			}

			.cookie-body {
				transform-box: fill-box;
				transform-origin: center;
				transition: transform 140ms ease;
			}

			.cookie:hover .cookie-body,
			.cookie:focus-visible .cookie-body {
				transform: scale(1.18) rotate(-8deg);
			}

			.scene[data-beat='odd'] {
				--flicker: flicker-a;
				--spin: spin-a;
			}

			.scene[data-beat='even'] {
				--flicker: flicker-b;
				--spin: spin-b;
			}

			.scene:not([data-beat='rest']) .page-layer {
				animation: var(--flicker) 520ms ease-out;
			}

			.scene:not([data-beat='rest']) .reload .press {
				transform-box: fill-box;
				transform-origin: center;
				animation: var(--spin) 520ms ease-out;
			}

			.scene[data-nudge='odd'] .cookie-body {
				animation: wobble-a 420ms ease-out;
			}

			.scene[data-nudge='even'] .cookie-body {
				animation: wobble-b 420ms ease-out;
			}

			@keyframes flicker-a {
				0% {
					opacity: 1;
				}
				18% {
					opacity: 0.05;
				}
				45% {
					opacity: 0.05;
				}
				100% {
					opacity: 1;
				}
			}

			@keyframes flicker-b {
				0% {
					opacity: 1;
				}
				18% {
					opacity: 0.05;
				}
				45% {
					opacity: 0.05;
				}
				100% {
					opacity: 1;
				}
			}

			@keyframes spin-a {
				to {
					transform: rotate(360deg);
				}
			}

			@keyframes spin-b {
				to {
					transform: rotate(360deg);
				}
			}

			@keyframes wobble-a {
				25% {
					transform: rotate(-14deg);
				}
				55% {
					transform: rotate(10deg);
				}
				80% {
					transform: rotate(-4deg);
				}
			}

			@keyframes wobble-b {
				25% {
					transform: rotate(-14deg);
				}
				55% {
					transform: rotate(10deg);
				}
				80% {
					transform: rotate(-4deg);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.scene *,
				.scene .cookie {
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
		</style>
	</figure>
}
