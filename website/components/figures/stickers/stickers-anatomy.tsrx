// A sticker sheet and a page: each sticker placed is an Avatar, and every one shows the page's name as the selector turns.
import { computed, state } from '@markless/core';
import { BEAD, CHILD, clamp, describeBack, describeDial, describePlace, DIAL, flip, NAMES, nameOf, cycle, PROP, PROP_SOURCE, START, STICKER_TOUR, TAG, turn } from './model.ts';
import { art } from './stickers.art.ts';

export default function StickersAnatomy() @{
	let who = state(START);
	const name = computed(() => nameOf(who));
	let beat = state('rest');
	let touched = state(false);
	let said = state('');
	let spin = state(false);
	let on0 = state(false);
	let dx0 = state(0);
	let dy0 = state(0);
	let drag0 = state(false);
	let bead0 = state('rest');
	let on1 = state(false);
	let dx1 = state(0);
	let dy1 = state(0);
	let drag1 = state(false);
	let bead1 = state('rest');
	let on2 = state(false);
	let dx2 = state(0);
	let dy2 = state(0);
	let drag2 = state(false);
	let bead2 = state('rest');
	let on3 = state(false);
	let dx3 = state(0);
	let dy3 = state(0);
	let drag3 = state(false);
	let bead3 = state('rest');
	const placed = computed(() => (on0 ? 1 : 0) + (on1 ? 1 : 0) + (on2 ? 1 : 0) + (on3 ? 1 : 0));
	const scaleOf = (event: Event) => {
		const svg = (event.currentTarget as SVGGraphicsElement).ownerSVGElement;
		const width = svg?.getBoundingClientRect().width ?? art.width;
		return art.width / (width || art.width);
	};
	const onPage = (x: number, y: number) => x > art.page.box[0] && x < art.page.box[2] && y > art.page.box[1] && y < art.page.box[3];
	const setWho = (to: number) => {
		if (to === who) return;
		who = to;
		beat = flip(beat);
		said = describeDial(who, (on0 ? 1 : 0) + (on1 ? 1 : 0) + (on2 ? 1 : 0) + (on3 ? 1 : 0));
	};
	const place0 = () => {
		on0 = true;
		dx0 = 286;
		dy0 = -40;
		said = describePlace((on0 ? 1 : 0) + (on1 ? 1 : 0) + (on2 ? 1 : 0) + (on3 ? 1 : 0), who);
	};
	const back0 = () => {
		on0 = false;
		dx0 = 0;
		dy0 = 0;
		said = describeBack((on0 ? 1 : 0) + (on1 ? 1 : 0) + (on2 ? 1 : 0) + (on3 ? 1 : 0));
	};
	const smear0 = () => {
		bead0 = flip(bead0);
		said = BEAD;
	};
	const place1 = () => {
		on1 = true;
		dx1 = 294;
		dy1 = -40;
		said = describePlace((on0 ? 1 : 0) + (on1 ? 1 : 0) + (on2 ? 1 : 0) + (on3 ? 1 : 0), who);
	};
	const back1 = () => {
		on1 = false;
		dx1 = 0;
		dy1 = 0;
		said = describeBack((on0 ? 1 : 0) + (on1 ? 1 : 0) + (on2 ? 1 : 0) + (on3 ? 1 : 0));
	};
	const smear1 = () => {
		bead1 = flip(bead1);
		said = BEAD;
	};
	const place2 = () => {
		on2 = true;
		dx2 = 286;
		dy2 = -66;
		said = describePlace((on0 ? 1 : 0) + (on1 ? 1 : 0) + (on2 ? 1 : 0) + (on3 ? 1 : 0), who);
	};
	const back2 = () => {
		on2 = false;
		dx2 = 0;
		dy2 = 0;
		said = describeBack((on0 ? 1 : 0) + (on1 ? 1 : 0) + (on2 ? 1 : 0) + (on3 ? 1 : 0));
	};
	const smear2 = () => {
		bead2 = flip(bead2);
		said = BEAD;
	};
	const place3 = () => {
		on3 = true;
		dx3 = 294;
		dy3 = -66;
		said = describePlace((on0 ? 1 : 0) + (on1 ? 1 : 0) + (on2 ? 1 : 0) + (on3 ? 1 : 0), who);
	};
	const back3 = () => {
		on3 = false;
		dx3 = 0;
		dy3 = 0;
		said = describeBack((on0 ? 1 : 0) + (on1 ? 1 : 0) + (on2 ? 1 : 0) + (on3 ? 1 : 0));
	};
	const smear3 = () => {
		bead3 = flip(bead3);
		said = BEAD;
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
				const next = STICKER_TOUR[step % STICKER_TOUR.length];
				step++;
				if (next === 'place') {
					if (!on0) place0();
					else if (!on1) place1();
				}
				if (next === 'dial') setWho(cycle(who));
				if (next === 'reset') {
					on0 = false;
					dx0 = 0;
					dy0 = 0;
					bead0 = 'rest';
					on1 = false;
					dx1 = 0;
					dy1 = 0;
					bead1 = 'rest';
					on2 = false;
					dx2 = 0;
					dy2 = 0;
					bead2 = 'rest';
					on3 = false;
					dx3 = 0;
					dy3 = 0;
					bead3 = 'rest';
					who = START;
					beat = 'rest';
					said = '';
				}
			}, 1700);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
		onKeyDown={(event) => {
			if (event.key === 'Escape') {
				touched = true;
				on0 = false;
				dx0 = 0;
				dy0 = 0;
				bead0 = 'rest';
				on1 = false;
				dx1 = 0;
				dy1 = 0;
				bead1 = 'rest';
				on2 = false;
				dx2 = 0;
				dy2 = 0;
				bead2 = 'rest';
				on3 = false;
				dx3 = 0;
				dy3 = 0;
				bead3 = 'rest';
				who = START;
				beat = 'rest';
				said = 'Back to the start: every sticker on the sheet, the name back to ' + nameOf(START) + '.';
			}
		}}
	>
		<svg class="scene" data-beat={beat} data-spin={spin ? '' : undefined} data-placed={placed} data-who={who} viewBox={'0 0 ' + art.width + ' ' + art.height} role="group" aria-label="A sticker sheet and a page with a name selector">
			<path class="hatch light on-desk" d={art.sheet.shadow} />
			<path class="liner" d={art.sheet.paper} />
			<path class="hatch faint" d={art.sheet.grid} />
			<path class="ink" d={art.sheet.rule} />
			<text class="tag" x={art.sheet.label.x} y={art.sheet.label.y}>{TAG}</text>
			<path class="hole" d={art.sheet.holes[0]} />
			<path class="hole" d={art.sheet.holes[1]} />
			<path class="hole" d={art.sheet.holes[2]} />
			<path class="hole" d={art.sheet.holes[3]} />
			<path class="desk" d={art.sheet.under} />
			<path class="liner" d={art.sheet.curl} />
			<path class="hatch" d={art.sheet.curlShade} />
			<path class="ink" d={art.sheet.curlInk} />
			<path class="ink" d={art.sheet.ink} />

			<path class="hatch light on-desk" d={art.page.shadow} />
			<path class="page-paper" d={art.page.paper} />
			<path class="hatch faint" d={art.page.bar} />
			<path class="ink writing" d={art.page.writing} />
			<path class="ink" d={art.page.ink} />

			<path class="wash yellow pick-spot p0" d={art.dial.spots[0]} />
			<path class="wash yellow pick-spot p1" d={art.dial.spots[1]} />
			<path class="wash yellow pick-spot p2" d={art.dial.spots[2]} />
			<text class="pick p0" x={art.dial.labels[0].x} y={art.dial.labels[0].y}>{NAMES[0]}</text>
			<text class="pick p1" x={art.dial.labels[1].x} y={art.dial.labels[1].y}>{NAMES[1]}</text>
			<text class="pick p2" x={art.dial.labels[2].x} y={art.dial.labels[2].y}>{NAMES[2]}</text>
			<text class="dial-name" x={art.dial.name.x} y={art.dial.name.y}>{PROP}</text>
			<g
				class="dial"
				tabindex="0"
				role="slider"
				aria-label="The page's name selector"
				aria-valuemin="0"
				aria-valuemax={NAMES.length - 1}
				aria-valuenow={who}
				aria-valuetext={name}
				onPointerdown={(event) => {
					touched = true;
					const el = event.currentTarget as SVGGElement;
					if (el.hasPointerCapture?.(event.pointerId) === false) {
						try {
							el.setPointerCapture(event.pointerId);
						} catch {}
					}
					el.dataset.y = String(event.clientY);
					el.dataset.from = String(who);
					el.dataset.moved = '0';
					spin = true;
				}}
				onPointermove={(event) => {
					const el = event.currentTarget as SVGGElement;
					if (el.dataset.y === undefined) return;
					const steps = Math.round(((Number(el.dataset.y) - event.clientY) * scaleOf(event)) / DIAL);
					if (steps !== 0) el.dataset.moved = '1';
					setWho(turn(Number(el.dataset.from), steps));
				}}
				onPointerup={(event) => {
					const el = event.currentTarget as SVGGElement;
					const moved = el.dataset.moved === '1';
					delete el.dataset.y;
					spin = false;
					if (!moved) setWho(cycle(who));
				}}
				onPointercancel={(event) => {
					delete (event.currentTarget as SVGGElement).dataset.y;
					spin = false;
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
						event.preventDefault();
						touched = true;
						setWho(turn(who, 1));
					}
					if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
						event.preventDefault();
						touched = true;
						setWho(turn(who, -1));
					}
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						touched = true;
						setWho(cycle(who));
					}
				}}
			>
				<path class="hatch light" d={art.dial.shadow} />
				<path class="ink" d={art.dial.ticks} />
				<g class="knob" style={'transform: rotate(' + (who - 1) * 60 + 'deg)'}>
					<path class="knob-fill" d={art.dial.knob} />
					<path class="hatch" d={art.dial.shade} />
					<path class="cap" d={art.dial.cap} />
					<path class="ink" d={art.dial.ink} />
					<path class="ink" d={art.dial.pointer} />
				</g>
			</g>

			<g
				class="sticker"
				tabindex="0"
				role="button"
				aria-label={on0 ? CHILD + ' on the page, showing ' + name + '. Type on it, or press Delete to peel it back.' : CHILD + ' sticker on the sheet. Press, or drag it onto the page.'}
				data-on={on0 ? '' : undefined}
				data-drag={drag0 ? '' : undefined}
				data-bead={bead0}
				style={'transform: translate(' + (88 + dx0) + 'px, ' + (152 + dy0) + 'px)'}
				onPointerdown={(event) => {
					touched = true;
					const el = event.currentTarget as SVGGElement;
					if (el.hasPointerCapture?.(event.pointerId) === false) {
						try {
							el.setPointerCapture(event.pointerId);
						} catch {}
					}
					el.dataset.x = String(event.clientX);
					el.dataset.y = String(event.clientY);
					el.dataset.ox = String(dx0);
					el.dataset.oy = String(dy0);
					el.dataset.moved = '0';
					drag0 = true;
				}}
				onPointermove={(event) => {
					const el = event.currentTarget as SVGGElement;
					if (el.dataset.x === undefined) return;
					const k = scaleOf(event);
					const mx = (event.clientX - Number(el.dataset.x)) * k;
					const my = (event.clientY - Number(el.dataset.y)) * k;
					if (Math.hypot(mx, my) > 5) el.dataset.moved = '1';
					dx0 = clamp(Number(el.dataset.ox) + mx, -88, art.width - 88);
					dy0 = clamp(Number(el.dataset.oy) + my, -152, art.height - 152);
				}}
				onPointerup={(event) => {
					const el = event.currentTarget as SVGGElement;
					const moved = el.dataset.moved === '1';
					delete el.dataset.x;
					drag0 = false;
					if (!moved) {
						if (on0) smear0();
						else place0();
						return;
					}
					if (onPage(88 + dx0, 152 + dy0)) {
						on0 = true;
						said = describePlace((on0 ? 1 : 0) + (on1 ? 1 : 0) + (on2 ? 1 : 0) + (on3 ? 1 : 0), who);
					} else back0();
				}}
				onPointercancel={(event) => {
					delete (event.currentTarget as SVGGElement).dataset.x;
					drag0 = false;
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						touched = true;
						if (on0) smear0();
						else place0();
					}
					if (event.key === 'Delete' || event.key === 'Backspace') {
						event.preventDefault();
						touched = true;
						if (on0) back0();
					}
					if (event.key.length === 1 && event.key !== ' ' && on0) {
						touched = true;
						smear0();
					}
				}}
			>
				<g class="face">
					<path class="hatch light lift-shadow" d={art.sticker.shadow} />
					<path class="sticker-paper" d={art.sticker.paper} />
					<path class="hatch faint" d={art.sticker.gloss} />
					<path class="wash yellow spot" d={art.sticker.spot} />
					<path class="face" d={art.sticker.face} />
					<path class="hatch" d={art.sticker.faceShade} />
					<path class="ink" d={art.sticker.ink} />
					<path class="ink empty" d={art.sticker.empty} />
					<text class="num" x={art.sticker.number.x} y={art.sticker.number.y}>{name}</text>
					<path class="liner" d={art.sticker.curlUnder} />
					<path class="sticker-paper curl" d={art.sticker.curl} />
					<path class="ink curl" d={art.sticker.curlInk} />
					<g class="bead">
						<path class="ink scribble" d={art.sticker.scribble.d} />
						<path class="ink drop d0" d={art.sticker.drops[0].d} />
						<path class="ink drop d1" d={art.sticker.drops[1].d} />
						<path class="ink drop d2" d={art.sticker.drops[2].d} />
						<path class="ink drop d3" d={art.sticker.drops[3].d} />
						<path class="ink drop d4" d={art.sticker.drops[4].d} />
					</g>
				</g>
			</g>
			<g
				class="sticker"
				tabindex="0"
				role="button"
				aria-label={on1 ? CHILD + ' on the page, showing ' + name + '. Type on it, or press Delete to peel it back.' : CHILD + ' sticker on the sheet. Press, or drag it onto the page.'}
				data-on={on1 ? '' : undefined}
				data-drag={drag1 ? '' : undefined}
				data-bead={bead1}
				style={'transform: translate(' + (190 + dx1) + 'px, ' + (152 + dy1) + 'px)'}
				onPointerdown={(event) => {
					touched = true;
					const el = event.currentTarget as SVGGElement;
					if (el.hasPointerCapture?.(event.pointerId) === false) {
						try {
							el.setPointerCapture(event.pointerId);
						} catch {}
					}
					el.dataset.x = String(event.clientX);
					el.dataset.y = String(event.clientY);
					el.dataset.ox = String(dx1);
					el.dataset.oy = String(dy1);
					el.dataset.moved = '0';
					drag1 = true;
				}}
				onPointermove={(event) => {
					const el = event.currentTarget as SVGGElement;
					if (el.dataset.x === undefined) return;
					const k = scaleOf(event);
					const mx = (event.clientX - Number(el.dataset.x)) * k;
					const my = (event.clientY - Number(el.dataset.y)) * k;
					if (Math.hypot(mx, my) > 5) el.dataset.moved = '1';
					dx1 = clamp(Number(el.dataset.ox) + mx, -190, art.width - 190);
					dy1 = clamp(Number(el.dataset.oy) + my, -152, art.height - 152);
				}}
				onPointerup={(event) => {
					const el = event.currentTarget as SVGGElement;
					const moved = el.dataset.moved === '1';
					delete el.dataset.x;
					drag1 = false;
					if (!moved) {
						if (on1) smear1();
						else place1();
						return;
					}
					if (onPage(190 + dx1, 152 + dy1)) {
						on1 = true;
						said = describePlace((on0 ? 1 : 0) + (on1 ? 1 : 0) + (on2 ? 1 : 0) + (on3 ? 1 : 0), who);
					} else back1();
				}}
				onPointercancel={(event) => {
					delete (event.currentTarget as SVGGElement).dataset.x;
					drag1 = false;
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						touched = true;
						if (on1) smear1();
						else place1();
					}
					if (event.key === 'Delete' || event.key === 'Backspace') {
						event.preventDefault();
						touched = true;
						if (on1) back1();
					}
					if (event.key.length === 1 && event.key !== ' ' && on1) {
						touched = true;
						smear1();
					}
				}}
			>
				<g class="face">
					<path class="hatch light lift-shadow" d={art.sticker.shadow} />
					<path class="sticker-paper" d={art.sticker.paper} />
					<path class="hatch faint" d={art.sticker.gloss} />
					<path class="wash yellow spot" d={art.sticker.spot} />
					<path class="face" d={art.sticker.face} />
					<path class="hatch" d={art.sticker.faceShade} />
					<path class="ink" d={art.sticker.ink} />
					<path class="ink empty" d={art.sticker.empty} />
					<text class="num" x={art.sticker.number.x} y={art.sticker.number.y}>{name}</text>
					<path class="liner" d={art.sticker.curlUnder} />
					<path class="sticker-paper curl" d={art.sticker.curl} />
					<path class="ink curl" d={art.sticker.curlInk} />
					<g class="bead">
						<path class="ink scribble" d={art.sticker.scribble.d} />
						<path class="ink drop d0" d={art.sticker.drops[0].d} />
						<path class="ink drop d1" d={art.sticker.drops[1].d} />
						<path class="ink drop d2" d={art.sticker.drops[2].d} />
						<path class="ink drop d3" d={art.sticker.drops[3].d} />
						<path class="ink drop d4" d={art.sticker.drops[4].d} />
					</g>
				</g>
			</g>
			<g
				class="sticker"
				tabindex="0"
				role="button"
				aria-label={on2 ? CHILD + ' on the page, showing ' + name + '. Type on it, or press Delete to peel it back.' : CHILD + ' sticker on the sheet. Press, or drag it onto the page.'}
				data-on={on2 ? '' : undefined}
				data-drag={drag2 ? '' : undefined}
				data-bead={bead2}
				style={'transform: translate(' + (88 + dx2) + 'px, ' + (266 + dy2) + 'px)'}
				onPointerdown={(event) => {
					touched = true;
					const el = event.currentTarget as SVGGElement;
					if (el.hasPointerCapture?.(event.pointerId) === false) {
						try {
							el.setPointerCapture(event.pointerId);
						} catch {}
					}
					el.dataset.x = String(event.clientX);
					el.dataset.y = String(event.clientY);
					el.dataset.ox = String(dx2);
					el.dataset.oy = String(dy2);
					el.dataset.moved = '0';
					drag2 = true;
				}}
				onPointermove={(event) => {
					const el = event.currentTarget as SVGGElement;
					if (el.dataset.x === undefined) return;
					const k = scaleOf(event);
					const mx = (event.clientX - Number(el.dataset.x)) * k;
					const my = (event.clientY - Number(el.dataset.y)) * k;
					if (Math.hypot(mx, my) > 5) el.dataset.moved = '1';
					dx2 = clamp(Number(el.dataset.ox) + mx, -88, art.width - 88);
					dy2 = clamp(Number(el.dataset.oy) + my, -266, art.height - 266);
				}}
				onPointerup={(event) => {
					const el = event.currentTarget as SVGGElement;
					const moved = el.dataset.moved === '1';
					delete el.dataset.x;
					drag2 = false;
					if (!moved) {
						if (on2) smear2();
						else place2();
						return;
					}
					if (onPage(88 + dx2, 266 + dy2)) {
						on2 = true;
						said = describePlace((on0 ? 1 : 0) + (on1 ? 1 : 0) + (on2 ? 1 : 0) + (on3 ? 1 : 0), who);
					} else back2();
				}}
				onPointercancel={(event) => {
					delete (event.currentTarget as SVGGElement).dataset.x;
					drag2 = false;
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						touched = true;
						if (on2) smear2();
						else place2();
					}
					if (event.key === 'Delete' || event.key === 'Backspace') {
						event.preventDefault();
						touched = true;
						if (on2) back2();
					}
					if (event.key.length === 1 && event.key !== ' ' && on2) {
						touched = true;
						smear2();
					}
				}}
			>
				<g class="face">
					<path class="hatch light lift-shadow" d={art.sticker.shadow} />
					<path class="sticker-paper" d={art.sticker.paper} />
					<path class="hatch faint" d={art.sticker.gloss} />
					<path class="wash yellow spot" d={art.sticker.spot} />
					<path class="face" d={art.sticker.face} />
					<path class="hatch" d={art.sticker.faceShade} />
					<path class="ink" d={art.sticker.ink} />
					<path class="ink empty" d={art.sticker.empty} />
					<text class="num" x={art.sticker.number.x} y={art.sticker.number.y}>{name}</text>
					<path class="liner" d={art.sticker.curlUnder} />
					<path class="sticker-paper curl" d={art.sticker.curl} />
					<path class="ink curl" d={art.sticker.curlInk} />
					<g class="bead">
						<path class="ink scribble" d={art.sticker.scribble.d} />
						<path class="ink drop d0" d={art.sticker.drops[0].d} />
						<path class="ink drop d1" d={art.sticker.drops[1].d} />
						<path class="ink drop d2" d={art.sticker.drops[2].d} />
						<path class="ink drop d3" d={art.sticker.drops[3].d} />
						<path class="ink drop d4" d={art.sticker.drops[4].d} />
					</g>
				</g>
			</g>
			<g
				class="sticker"
				tabindex="0"
				role="button"
				aria-label={on3 ? CHILD + ' on the page, showing ' + name + '. Type on it, or press Delete to peel it back.' : CHILD + ' sticker on the sheet. Press, or drag it onto the page.'}
				data-on={on3 ? '' : undefined}
				data-drag={drag3 ? '' : undefined}
				data-bead={bead3}
				style={'transform: translate(' + (190 + dx3) + 'px, ' + (266 + dy3) + 'px)'}
				onPointerdown={(event) => {
					touched = true;
					const el = event.currentTarget as SVGGElement;
					if (el.hasPointerCapture?.(event.pointerId) === false) {
						try {
							el.setPointerCapture(event.pointerId);
						} catch {}
					}
					el.dataset.x = String(event.clientX);
					el.dataset.y = String(event.clientY);
					el.dataset.ox = String(dx3);
					el.dataset.oy = String(dy3);
					el.dataset.moved = '0';
					drag3 = true;
				}}
				onPointermove={(event) => {
					const el = event.currentTarget as SVGGElement;
					if (el.dataset.x === undefined) return;
					const k = scaleOf(event);
					const mx = (event.clientX - Number(el.dataset.x)) * k;
					const my = (event.clientY - Number(el.dataset.y)) * k;
					if (Math.hypot(mx, my) > 5) el.dataset.moved = '1';
					dx3 = clamp(Number(el.dataset.ox) + mx, -190, art.width - 190);
					dy3 = clamp(Number(el.dataset.oy) + my, -266, art.height - 266);
				}}
				onPointerup={(event) => {
					const el = event.currentTarget as SVGGElement;
					const moved = el.dataset.moved === '1';
					delete el.dataset.x;
					drag3 = false;
					if (!moved) {
						if (on3) smear3();
						else place3();
						return;
					}
					if (onPage(190 + dx3, 266 + dy3)) {
						on3 = true;
						said = describePlace((on0 ? 1 : 0) + (on1 ? 1 : 0) + (on2 ? 1 : 0) + (on3 ? 1 : 0), who);
					} else back3();
				}}
				onPointercancel={(event) => {
					delete (event.currentTarget as SVGGElement).dataset.x;
					drag3 = false;
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						touched = true;
						if (on3) smear3();
						else place3();
					}
					if (event.key === 'Delete' || event.key === 'Backspace') {
						event.preventDefault();
						touched = true;
						if (on3) back3();
					}
					if (event.key.length === 1 && event.key !== ' ' && on3) {
						touched = true;
						smear3();
					}
				}}
			>
				<g class="face">
					<path class="hatch light lift-shadow" d={art.sticker.shadow} />
					<path class="sticker-paper" d={art.sticker.paper} />
					<path class="hatch faint" d={art.sticker.gloss} />
					<path class="wash yellow spot" d={art.sticker.spot} />
					<path class="face" d={art.sticker.face} />
					<path class="hatch" d={art.sticker.faceShade} />
					<path class="ink" d={art.sticker.ink} />
					<path class="ink empty" d={art.sticker.empty} />
					<text class="num" x={art.sticker.number.x} y={art.sticker.number.y}>{name}</text>
					<path class="liner" d={art.sticker.curlUnder} />
					<path class="sticker-paper curl" d={art.sticker.curl} />
					<path class="ink curl" d={art.sticker.curlInk} />
					<g class="bead">
						<path class="ink scribble" d={art.sticker.scribble.d} />
						<path class="ink drop d0" d={art.sticker.drops[0].d} />
						<path class="ink drop d1" d={art.sticker.drops[1].d} />
						<path class="ink drop d2" d={art.sticker.drops[2].d} />
						<path class="ink drop d3" d={art.sticker.drops[3].d} />
						<path class="ink drop d4" d={art.sticker.drops[4].d} />
					</g>
				</g>
			</g>
			<text class="tip" x={art.caption.x} y={art.caption.y}>{PROP_SOURCE}</text>
		</svg>
		<figcaption class="sr">
			A pen-and-ink sticker sheet labelled {TAG} lies beside a page with a {PROP} selector: {NAMES[0]}, {NAMES[1]} or {NAMES[2]}. Press a
			sticker, or drag it onto the page, and it becomes an {CHILD} badge that shows the page's {PROP}. Place several. Turn the selector, by
			dragging it, pressing it or with the arrow keys, and every placed sticker shows the new name at once, without being placed again. Try to write on a placed sticker, by pressing it or
			typing on it, and the ink beads off: only the page can change {PROP}. Drag a sticker off the page, or press Delete, to peel it back.
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
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--liner: color-mix(in oklch, var(--paper) 70%, oklch(86% 0.04 85));
				--sticker: color-mix(in oklch, var(--paper) 20%, white);
				--knob: color-mix(in oklch, var(--paper) 60%, oklch(70% 0.02 250));
				--line: var(--ink);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--liner: color-mix(in oklch, var(--ink) 88%, oklch(70% 0.05 85));
					--sticker: color-mix(in oklch, var(--ink) 96%, white);
					--knob: color-mix(in oklch, var(--ink) 85%, oklch(60% 0.02 250));
					--line: var(--paper);
				}
			}

			.liner {
				fill: var(--liner);
			}

			.page-paper,
			.cap {
				fill: var(--sheet);
			}

			.sticker-paper {
				fill: var(--sticker);
			}

			.knob-fill {
				fill: var(--knob);
			}

			.writing {
				opacity: 0.45;
			}

			.drop {
				fill: var(--line);
			}

			.desk {
				fill: var(--paper);
			}

			.ink {
				fill: var(--line);
			}

			.hatch {
				fill: none;
				stroke: var(--line);
				stroke-width: 0.75;
				stroke-linecap: round;
			}

			.on-desk {
				stroke: var(--ink);
			}

			.light {
				opacity: 0.5;
			}

			.faint {
				opacity: 0.3;
			}

			.hole {
				fill: color-mix(in oklch, var(--liner) 80%, var(--line));
				fill-opacity: 0.12;
				stroke: var(--line);
				stroke-width: 0.8;
				stroke-dasharray: 3 3;
				opacity: 0.6;
			}

			.wash {
				mix-blend-mode: multiply;
			}

			.yellow {
				fill: var(--yellow);
				opacity: 0.55;
			}

			.pick-spot {
				opacity: 0;
				transition: opacity 200ms ease;
			}

			.scene[data-who='0'] .pick-spot.p0,
			.scene[data-who='1'] .pick-spot.p1,
			.scene[data-who='2'] .pick-spot.p2 {
				opacity: 0.6;
			}

			.pick {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 15px;
				font-weight: 600;
				text-anchor: middle;
				fill: var(--line);
				opacity: 0.55;
				transition: opacity 200ms ease;
			}

			.scene[data-who='0'] .pick.p0,
			.scene[data-who='1'] .pick.p1,
			.scene[data-who='2'] .pick.p2 {
				font-weight: 800;
				opacity: 1;
			}

			.face {
				fill: color-mix(in oklch, var(--sticker) 70%, var(--pink));
			}

			.tag,
			.num,
			.dial-name,
			.tip {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--line);
			}

			.tag {
				font-size: 19px;
				font-weight: 800;
				text-anchor: middle;
			}

			.num {
				font-size: 17px;
				font-weight: 800;
				text-anchor: start;
				opacity: 0;
			}

			.dial-name {
				font-size: 17px;
				font-weight: 700;
				text-anchor: middle;
			}

			.tip {
				font-size: 15px;
				font-weight: 700;
				text-anchor: middle;
				opacity: 0;
				pointer-events: none;
				transition: opacity 160ms ease;
			}

			.bead,
			.lift-shadow {
				pointer-events: none;
			}

			.sticker {
				cursor: grab;
				outline: none;
			}

			.sticker:not([data-drag]) {
				transition: transform 360ms cubic-bezier(0.3, 1.25, 0.5, 1);
			}

			.sticker[data-drag] {
				cursor: grabbing;
			}

			.face {
				transition: transform 180ms ease;
			}

			.sticker[data-on] .num {
				opacity: 1;
			}

			.sticker[data-on] .empty,
			.sticker .spot,
			.lift-shadow,
			.curl,
			.liner.curl,
			.bead {
				opacity: 0;
			}

			.sticker[data-on] .lift-shadow {
				opacity: 0.35;
			}

			.sticker .liner {
				opacity: 0;
			}

			.sticker:hover .face,
			.sticker:focus-visible .face,
			.sticker[data-drag] .face {
				transform: translate(-1px, -3px) rotate(-1.5deg);
			}

			.sticker:hover .lift-shadow,
			.sticker:focus-visible .lift-shadow,
			.sticker[data-drag] .lift-shadow {
				opacity: 0.6;
			}

			.sticker:hover .curl,
			.sticker:focus-visible .curl,
			.sticker[data-drag] .curl,
			.sticker:hover .liner,
			.sticker:focus-visible .liner,
			.sticker[data-drag] .liner {
				opacity: 1;
			}

			.scene:has(.sticker[data-on]:hover) .tip,
			.scene:has(.sticker[data-on]:focus-visible) .tip {
				opacity: 1;
			}

			.sticker:focus-visible .sticker-paper:not(.curl) {
				stroke: var(--line);
				stroke-width: 1.4;
				stroke-dasharray: 4 4;
			}

			.dial {
				cursor: ns-resize;
				outline: none;
			}

			.knob {
				transform-box: view-box;
				transform-origin: 566px 300px;
				transition: transform 260ms cubic-bezier(0.3, 1.4, 0.5, 1);
			}

			.dial:hover .knob-fill,
			.dial:focus-visible .knob-fill {
				fill: color-mix(in oklch, var(--knob) 80%, var(--pink));
			}

			.dial:focus-visible .cap {
				stroke: var(--line);
				stroke-width: 1.4;
				stroke-dasharray: 4 4;
			}

			.scene[data-beat='odd'] {
				--glow: glow-a;
			}

			.scene[data-beat='even'] {
				--glow: glow-b;
			}

			.scene:not([data-beat='rest']) .sticker[data-on] .spot {
				animation: var(--glow) 900ms ease-out both;
			}

			.sticker[data-bead='odd'] .bead {
				animation: show-a 1300ms linear both;
			}

			.sticker[data-bead='even'] .bead {
				animation: show-b 1300ms linear both;
			}

			.sticker[data-bead='odd'] .scribble {
				animation: scrawl-a 1300ms ease-out both;
			}

			.sticker[data-bead='even'] .scribble {
				animation: scrawl-b 1300ms ease-out both;
			}

			.sticker[data-bead='odd'] .drop {
				animation: roll-a 1300ms ease-in both;
			}

			.sticker[data-bead='even'] .drop {
				animation: roll-b 1300ms ease-in both;
			}

			.d1 {
				animation-delay: 60ms !important;
			}

			.d2 {
				animation-delay: 120ms !important;
			}

			.d3 {
				animation-delay: 180ms !important;
			}

			.d4 {
				animation-delay: 240ms !important;
			}

			.sticker[data-bead='odd'] .face {
				animation: shrug-a 500ms 300ms ease-out;
			}

			.sticker[data-bead='even'] .face {
				animation: shrug-b 500ms 300ms ease-out;
			}

			@keyframes show-a {
				0%,
				99% {
					opacity: 1;
				}
				100% {
					opacity: 0;
				}
			}

			@keyframes show-b {
				0%,
				99% {
					opacity: 1;
				}
				100% {
					opacity: 0;
				}
			}

			@keyframes scrawl-a {
				0% {
					opacity: 0;
				}
				10%,
				35% {
					opacity: 1;
				}
				50%,
				100% {
					opacity: 0;
				}
			}

			@keyframes scrawl-b {
				0% {
					opacity: 0;
				}
				10%,
				35% {
					opacity: 1;
				}
				50%,
				100% {
					opacity: 0;
				}
			}

			@keyframes roll-a {
				0%,
				35% {
					opacity: 0;
					transform: none;
				}
				42% {
					opacity: 1;
					transform: none;
				}
				100% {
					opacity: 0;
					transform: translateY(40px) scale(0.7);
				}
			}

			@keyframes roll-b {
				0%,
				35% {
					opacity: 0;
					transform: none;
				}
				42% {
					opacity: 1;
					transform: none;
				}
				100% {
					opacity: 0;
					transform: translateY(40px) scale(0.7);
				}
			}

			@keyframes shrug-a {
				30% {
					transform: rotate(2deg);
				}
				65% {
					transform: rotate(-1.5deg);
				}
			}

			@keyframes shrug-b {
				30% {
					transform: rotate(2deg);
				}
				65% {
					transform: rotate(-1.5deg);
				}
			}

			@keyframes glow-a {
				0% {
					opacity: 0;
				}
				30% {
					opacity: 0.9;
				}
				100% {
					opacity: 0;
				}
			}

			@keyframes glow-b {
				0% {
					opacity: 0;
				}
				30% {
					opacity: 0.9;
				}
				100% {
					opacity: 0;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.scene *,
				.scene .sticker {
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
