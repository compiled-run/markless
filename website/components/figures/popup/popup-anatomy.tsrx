// An open pop-up book: the workshop page reads the order code into a map while the app builds, and the map ships across the gutter to the browser page, where one tap redraws only the status line. A timeline under the book plays and scrubs the story.
import { computed, state } from '@markless/core';
import { slider } from '@markless/ui';
import { goTo, play, show, stop } from './drive.ts';
import { CAPTION, CHAPTERS, describe, flip, HEADINGS, LAST, press, READY_TEXT, SCRUB_STEP, SHOW, START, STEPS, stopAt, timelineText, USUAL } from './model.ts';
import { art } from './popup.art.ts';

export default function PopupAnatomy() @{
	<slider.root class="story" min={0} max={LAST} step={SCRUB_STEP} value={0}>
		<Book />
	</slider.root>
}

function Book() @{
	const timeline = slider.state();
	let step = state(0);
	let status = state(START);
	let was = state('');
	let struck = state('');
	let beat = state('rest');
	let by = state('auto');
	let usual = state('no');
	let playing = state('false');
	const says = computed(() => (usual === 'yes' ? USUAL.says : STEPS[step]!.says));
	const said = computed(() => describe(status, was));
	const changed = computed(() => (was !== '' && was !== status ? 'yes' : 'no'));
	const first = computed(() => (struck === '' ? status : struck));
	const second = computed(() => (struck === '' ? '' : status));
	const ready = computed(() => (step === LAST && usual === 'no' ? 'false' : 'true'));
	const spoken = computed(() => timelineText(timeline.end));
	const chapter = computed(() => STEPS[stopAt(timeline.end)]!.chapter);
	const show4 = (w: readonly number[]) => '--a:' + w[0] + ';--b:' + w[1] + ';--c:' + w[2] + ';--d:' + w[3];
	const ink = art.ink;
	const size = ink.sizes;
	const wide = art.views[0]!;
	const tall = art.views[1]!;
	<figure
		class="popup"
		onVisible={(event) => {
			const host = event.target as HTMLElement;
			if (host.dataset.p !== undefined) return;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
				show(host, LAST);
				timeline.endAt = LAST;
				step = LAST;
				struck = START;
				status = READY_TEXT;
				return;
			}
			show(host, 0);
			timeline.endAt = 0;
			step = 0;
		}}
	>
		<div
			class="stage"
			data-beat={beat}
			data-by={by}
			data-usual={usual}
			data-changed={changed}
			data-struck={struck === '' ? 'no' : 'yes'}
			onClick={(event) => {
				const el = event.target as Element;
				const act = el.getAttribute('data-act');
				if (act === 'press') {
					if (step !== LAST || usual === 'yes') return;
					const next = press(status);
					was = status;
					if (next !== status) {
						struck = status;
						status = next;
					}
					by = 'user';
					beat = flip(beat);
					return;
				}
				if (act !== 'usual') return;
				stop(el);
				playing = 'false';
				status = START;
				was = '';
				struck = '';
				beat = 'rest';
				if (usual === 'yes') {
					usual = 'no';
					return;
				}
				show(el, LAST);
				timeline.endAt = LAST;
				step = LAST;
				usual = 'yes';
			}}
			onKeyDown={(event) => {
				const el = event.target as Element;
				const act = el.getAttribute('data-act');
				if (event.key === 'Escape') {
					status = START;
					was = '';
					struck = '';
					beat = 'rest';
					return;
				}
				if (!act || (event.key !== 'Enter' && event.key !== ' ')) return;
				event.preventDefault();
				el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			}}
		>
			@for (const view of art.views; key view.key) {
				<svg class={'scene ' + view.key} viewBox={'0 0 ' + view.width + ' ' + view.height} aria-hidden="true">
					<path class="shadow-wash" d={view.desk.wash} />
					<path class="hatch deep light" d={view.desk.hatch} />
					<path class="cloth" d={view.book.board.cloth} />
					<path class="ink" d={view.book.board.ink} />
					<path class="sheet" d={view.book.front.paper} />
					<path class="leaves" d={view.book.front.leaves} />
					<path class="ink" d={view.book.front.ink} />
					<path class="sheet shade" d={view.book.side.paper} />
					<path class="leaves" d={view.book.side.leaves} />
					<path class="ink" d={view.book.side.ink} />
					@for (const page of view.book.pages; key page) {
						<path class="sheet" d={page} />
					}
					<path class="pencil" d={view.book.pencil} />
					<path class="pencil" d={view.bases} />
					<path class="shadow-wash soft" d={view.book.gutter.soft} />
					<path class="shadow-wash" d={view.book.gutter.deep} />
					<path class="ink" d={view.book.ink} />
					<path class="ink divide" d={view.book.gutter.dashes} />
					<path class="ink" d={view.ship.ink} />
					<text class="hand ship" transform={view.ship.at} x="0" y="0" style={'font-size:' + size.control + 'px'}>ship</text>
					@for (const head of view.words.heads; key head.key) {
						<text class="hand head" transform={head.at} x="0" y="0" style={'font-size:' + size.head + 'px'}>{head.key === 'work' ? HEADINGS.work : HEADINGS.browser}</text>
					}

					<g class="win listing" style={show4(SHOW.listing)}>
						@for (const row of view.rows; key row.key) {
							<g transform={row.at}>
								@for (const tok of row.tokens; key tok.key) {
									<text class={'code ' + tok.tone} x={tok.x} y={tok.y} style={'font-size:' + size.listing + 'px'}>{tok.text}</text>
								}
							</g>
						}
					</g>
					<g class="steps" transform={view.words.caption}>
						@for (const caption of STEPS; key caption.caption) {
							<text class="win hand caption" style={show4(CAPTION[STEPS.indexOf(caption)]!) + ';font-size:' + size.caption + 'px'} x="0" y="0">{caption.caption}</text>
						}
						<text class="hand caption usual-caption" x="0" y="0" style={'font-size:' + size.caption + 'px'}>{USUAL.caption}</text>
					</g>
					<g class="controls">
						<path class="ink" d={view.controls.box} />
						<path class="ink tick" d={view.controls.tick} />
						<text class="hand control" transform={view.words.usual} x="0" y="0" style={'font-size:' + size.control + 'px'}>{USUAL.toggle}</text>
					</g>

					<g transform={view.browser.shadow}>
						<path class="shadow-wash" d={ink.browser.shadow.wash} />
						<path class="hatch deep light" d={ink.browser.shadow.hatch} />
						<path class="hatch deep" d={ink.browser.shadow.core} />
					</g>
					@for (const t of view.browser.tabs; key t.key) {
						<g>
							<g transform={t.vee}>
								<path class="sheet shade" d={ink.tab.vee} />
								<path class="hatch" d={ink.tab.veeHatch} />
								<path class="ink" d={ink.tab.veeInk} />
							</g>
							<g transform={t.leaf}>
								<path class="sheet" d={ink.tab.paper} />
								<path class="hatch light" d={ink.tab.tone} />
								<path class="ink" d={ink.tab.ink} />
							</g>
						</g>
					}
					<g transform={view.browser.at}>
						<path class="edge" d={ink.browser.edge} />
						<path class="sheet" d={ink.browser.paper} />
						<path class="hatch light" d={ink.browser.bar} />
						<path class="hatch light" d={ink.browser.tone} />
						<path class="ink" d={ink.browser.dots} />
						<path class="sheet" d={ink.browser.url.paper} />
						<path class="ink" d={ink.browser.url.ink} />
						<text class="url" x={ink.browser.url.x} y={ink.browser.url.y} style={'font-size:' + size.url + 'px'}>{ink.browser.url.text}</text>
						@for (const written of ink.browser.lines; key written.key) {
							<text class="said" x={written.x} y={written.y} style={'font-size:' + size.window + 'px'}>{written.text}</text>
						}
						<g class="btn">
							<path class="wash pink" d={ink.browser.button.wash} />
							<path class="ink" d={ink.browser.button.ink} />
							<text class="said small" x={ink.browser.button.x} y={ink.browser.button.y} text-anchor="middle" style={'font-size:' + size.button + 'px'}>{ink.browser.button.text}</text>
						</g>
						<path class="ink" d={ink.browser.ink} />
					</g>

					<g class="map-shadow piece" transform={view.bundle.start} data-keys={view.bundle.keys} style={'opacity:' + view.bundle.fade0}>
						<path class="shadow-wash" d={ink.cover.shadow} />
					</g>
					<g class="cards">
						@for (const card of view.cards; key card.key) {
							<g class={'piece' + (card.kept ? ' kept' : '')} transform={card.shadow.start} data-keys={card.shadow.keys} style={'opacity:' + card.shadow.fade0}>
								<path class="shadow-wash" d={ink.cards[card.i]!.shadow.wash} />
								<path class="hatch deep light" d={ink.cards[card.i]!.shadow.hatch} />
								<path class="hatch deep" d={ink.cards[card.i]!.shadow.core} />
							</g>
						}
						@for (const card of view.cards; key card.key) {
							<g>
								@for (const tab of card.tabs; key tab.key) {
									<g>
									<g class={'piece' + (card.kept ? ' kept' : '')} transform={tab.vee.start} data-keys={tab.vee.keys} style={'opacity:' + tab.vee.fade0}>
											<path class="sheet shade" d={ink.tab.vee} />
											<path class="hatch" d={ink.tab.veeHatch} />
											<path class="ink" d={ink.tab.veeInk} />
										</g>
										<g class={'piece' + (card.kept ? ' kept' : '')} transform={tab.leaf.start} data-keys={tab.leaf.keys} style={'opacity:' + tab.leaf.fade0}>
											<path class="sheet" d={ink.tab.paper} />
											<path class="hatch light" d={ink.tab.tone} />
											<path class="ink" d={ink.tab.ink} />
										</g>
								</g>
								}
								<g class={'piece' + (card.kept ? ' kept' : '')} transform={card.face.start} data-keys={card.face.keys}>
									<g class={ink.cards[card.i]!.once ? 'win leftover' : 'win'} style={show4(SHOW.paper)}>
										<path class="edge" d={ink.cards[card.i]!.edge} />
										<path class="ink" d={ink.cards[card.i]!.edgeInk} />
										<path class="sheet" d={ink.cards[card.i]!.paper} />
										<path class="hatch light" d={ink.cards[card.i]!.tone} />
										<path class="ink" d={ink.cards[card.i]!.ink} />
										<text class="kind" x={ink.cards[card.i]!.kind.x} y={ink.cards[card.i]!.kind.y} style={'font-size:' + size.kind + 'px'}>{ink.cards[card.i]!.kind.text}</text>
										@for (const tok of ink.cards[card.i]!.code; key tok.key) {
											<text class={'code ' + tok.tone} x={tok.x} y={tok.y} style={'font-size:' + size.code + 'px'}>{tok.text}</text>
										}
										<g class={'win stamp ' + ink.cards[card.i]!.stamp.tone} style={show4(SHOW.stamps) + ';--sx:' + ink.cards[card.i]!.stamp.cx + 'px;--sy:' + ink.cards[card.i]!.stamp.cy + 'px'}>
											<path class="stamp-box" d={ink.cards[card.i]!.stamp.box} />
											<text x={ink.cards[card.i]!.stamp.x} y={ink.cards[card.i]!.stamp.y} style={'font-size:' + size.stamp + 'px'}>{ink.cards[card.i]!.stamp.text}</text>
										</g>
									</g>
								</g>
							</g>
						}
						@for (const mark of ink.marks; key mark.key) {
							<g class="piece kept" transform={view.cards[mark.i]!.face.start} data-keys={view.cards[mark.i]!.face.keys}>
								<path class="red-ink win" style={show4(SHOW.rings)} d={mark.ring} />
							</g>
						}
					</g>
					<g class="piece" transform={view.cover.start} data-keys={view.cover.keys} style={'opacity:' + view.cover.fade0}>
						<path class="sheet" d={ink.cover.paper} />
						<path class="hatch light" d={ink.cover.tone} />
						<path class="ink" d={ink.cover.ink} />
						<text class="win hand cover-label" style={show4(SHOW.cover) + ';font-size:' + size.head + 'px'} x={ink.cover.label.x} y={ink.cover.label.y} text-anchor="middle">{ink.cover.label.text}</text>
					</g>

					@for (const thread of view.threads; key thread.d) {
						<g>
							<path class="thread win" style={show4(SHOW.threads)} d={thread.d} />
							<path class="string win" style={show4(SHOW.red)} d={thread.d} />
						</g>
					}
					<g class="win" style={show4([1.3, 1.9, 4.1, 4.35])}>
						@for (const pin of view.pins; key pin.key) {
							<g>
								<path class="pin-head" d={pin.head} />
								<path class="ink" d={pin.ink} />
								<path class="glint" d={pin.glint} />
							</g>
						}
					</g>
					<g class="map win" style={show4(SHOW.strings)}>
						@for (const link of view.links; key link.key) {
							<path class="link" d={link.d} />
						}
						@for (const s of view.strings; key s.key) {
							<path class="string" d={s.d} />
						}
						@for (const pin of view.knots; key pin.key) {
							<g>
								<path class="pin-head" d={pin.head} />
								<path class="ink" d={pin.ink} />
								<path class="glint" d={pin.glint} />
							</g>
						}
					</g>
					<path class="pulse" d={view.pulse.d} style={'--l:' + view.pulse.length} />

					<g class="usual">
						@for (const card of view.usual.cards; key card.key) {
							<g class={'usual-card' + (card.kept ? ' found' : '')}>
								<path class="sheet faint" d={card.paper} />
								<path class="pencil dark" d={card.outline} />
								<text class="kind" transform={card.label} x="7" y="21" style={'font-size:' + size.usual + 'px'}>{card.text}</text>
							</g>
						}
						@for (const glass of view.usual.glasses; key glass.key) {
							<g class="glass" style={glass.style}>
								<path class="pencil dark" d={ink.glass} />
							</g>
						}
					</g>

					<g transform={'translate(' + view.browser.tap[0] + ' ' + view.browser.tap[1] + ')'}>
						<g class="cursor">
							<path class="ink tap" d={ink.cursor.tap} />
							<path class="sheet" d={ink.cursor.paper} />
							<path class="ink" d={ink.cursor.ink} />
						</g>
					</g>
				</svg>
			}
			<svg class="scene overlay wide" viewBox={'0 0 ' + wide.width + ' ' + wide.height}>
				<g transform={wide.browser.at} aria-hidden="true">
					<g class="spot a">
						<path class="wash yellow" d={ink.browser.value.spots.a.wash} />
						<path class="wash-edge" d={ink.browser.value.spots.a.edge} />
					</g>
					<g class="spot b">
						<path class="wash yellow" d={ink.browser.value.spots.b.wash} />
						<path class="wash-edge" d={ink.browser.value.spots.b.edge} />
					</g>
					<text class="said first" x={ink.browser.value.x} y={ink.browser.value.y} style={'font-size:' + ink.browser.value.size + 'px'}>{first}</text>
					<path class="strike" d={ink.browser.value.strike.d} style={'--l:' + ink.browser.value.strike.length} />
					<text class="said now" x={ink.browser.value.x2} y={ink.browser.value.y} style={'font-size:' + ink.browser.value.size + 'px'}>{second}</text>
				</g>
				<path class="hit" d={wide.browser.press} role="button" tabindex="0" data-act="press" aria-label="Mark ready" aria-disabled={ready} />
				<path class="hit" d={wide.controls.usualHit} role="switch" tabindex="0" data-act="usual" aria-label="Show the usual way" aria-checked={usual === 'yes' ? 'true' : 'false'} />
			</svg>
			<svg class="scene overlay tall" viewBox={'0 0 ' + tall.width + ' ' + tall.height}>
				<g transform={tall.browser.at} aria-hidden="true">
					<g class="spot a">
						<path class="wash yellow" d={ink.browser.value.spots.a.wash} />
						<path class="wash-edge" d={ink.browser.value.spots.a.edge} />
					</g>
					<g class="spot b">
						<path class="wash yellow" d={ink.browser.value.spots.b.wash} />
						<path class="wash-edge" d={ink.browser.value.spots.b.edge} />
					</g>
					<text class="said first" x={ink.browser.value.x} y={ink.browser.value.y} style={'font-size:' + ink.browser.value.size + 'px'}>{first}</text>
					<path class="strike" d={ink.browser.value.strike.d} style={'--l:' + ink.browser.value.strike.length} />
					<text class="said now" x={ink.browser.value.x2} y={ink.browser.value.y} style={'font-size:' + ink.browser.value.size + 'px'}>{second}</text>
				</g>
				<path class="hit" d={tall.browser.press} role="button" tabindex="0" data-act="press" aria-label="Mark ready" aria-disabled={ready} />
				<path class="hit" d={tall.controls.usualHit} role="switch" tabindex="0" data-act="usual" aria-label="Show the usual way" aria-checked={usual === 'yes' ? 'true' : 'false'} />
			</svg>
		</div>
		<div class="timeline">
			<button
				type="button"
				class="play"
				aria-label="Play the story"
				aria-pressed={playing}
				onClick={(event) => {
					const button = event.target as Element;
					if (playing === 'true') {
						stop(button);
						playing = 'false';
						return;
					}
					usual = 'no';
					playing = 'true';
					play(
						button,
						(p) => {
							timeline.endAt = Math.round(p * 1000) / 1000;
							const i = stopAt(p);
							if (i !== step) step = i;
							if (i < LAST && (status !== START || struck !== '')) {
								status = START;
								was = '';
								struck = '';
								beat = 'rest';
							}
						},
						() => {
							playing = 'false';
							if (step !== LAST || usual === 'yes') return;
							was = status;
							struck = status;
							status = press(status);
							by = 'auto';
							beat = flip(beat);
						},
					);
				}}
			>
				<svg viewBox="-17 -17 34 34" aria-hidden="true">
					<path class="sheet" d={ink.timeline.thumb.paper} transform="scale(1.8)" />
					<path class="ink" d={ink.timeline.ring.ink} />
					<g class="icon-play">
						<path class="sheet" d={ink.timeline.play.paper} />
						<path class="hatch" d={ink.timeline.play.hatch} />
						<path class="ink" d={ink.timeline.play.ink} />
					</g>
					<g class="icon-pause">
						<path class="sheet" d={ink.timeline.pause.paper} />
						<path class="hatch" d={ink.timeline.pause.hatch} />
						<path class="ink" d={ink.timeline.pause.ink} />
					</g>
				</svg>
			</button>
			<div
				class="rail"
				onPointerDown={(event) => {
					if (event.button !== 0) return;
					const el = event.target as Element;
					stop(el);
					playing = 'false';
					usual = 'no';
					const p = timeline.endAt ?? 0;
					show(el, p);
					const i = stopAt(p);
					if (i !== step) step = i;
					if (i < LAST && (status !== START || struck !== '')) {
						status = START;
						was = '';
						struck = '';
						beat = 'rest';
					}
				}}
				onPointerMove={(event) => {
					if (event.buttons === 0) return;
					const el = event.target as Element;
					const p = timeline.endAt ?? 0;
					show(el, p);
					const i = stopAt(p);
					if (i !== step) step = i;
					if (i < LAST && (status !== START || struck !== '')) {
						status = START;
						was = '';
						struck = '';
						beat = 'rest';
					}
				}}
				onKeyDown={(event) => {
					if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'PageUp' && event.key !== 'PageDown' && event.key !== 'Home' && event.key !== 'End') return;
					const el = event.target as Element;
					stop(el);
					playing = 'false';
					usual = 'no';
					const p = timeline.endAt ?? 0;
					show(el, p);
					const i = stopAt(p);
					if (i !== step) step = i;
					if (i < LAST && (status !== START || struck !== '')) {
						status = START;
						was = '';
						struck = '';
						beat = 'rest';
					}
				}}
			>
				<slider.label class="sr">Story timeline</slider.label>
				<slider.track class="track">
					@for (const view of art.views; key view.key) {
						<svg class={'rail-ink ' + view.key} viewBox={'0 0 ' + view.rail.width + ' ' + view.rail.height} preserveAspectRatio="none" aria-hidden="true">
							<path class="pencil" d={view.rail.pencil} />
							<path class="ink" d={view.rail.ink} />
							<path class="ink" d={view.rail.ticks} />
						</svg>
					}
					<slider.thumb class="thumb" aria-valuetext={spoken}>
						<svg viewBox="-10 -10 20 20" aria-hidden="true">
							<path class="sheet" d={ink.timeline.thumb.paper} />
							<path class="hatch" d={ink.timeline.thumb.hatch} />
							<path class="ink" d={ink.timeline.thumb.ink} />
						</svg>
					</slider.thumb>
				</slider.track>
				<div
					class="chapters"
					aria-hidden="true"
					data-now={chapter}
					onClick={(event) => {
						const el = event.target as Element;
						const at = el.getAttribute('data-at');
						if (at === null) return;
						stop(el);
						playing = 'false';
						usual = 'no';
						goTo(el, Number(at), (p) => {
							timeline.endAt = Math.round(p * 1000) / 1000;
							const i = stopAt(p);
							if (i !== step) step = i;
							if (i < LAST && (status !== START || struck !== '')) {
								status = START;
								was = '';
								struck = '';
								beat = 'rest';
							}
						});
					}}
				>
					@for (const mark of CHAPTERS; key mark.name) {
						<span class="chapter" data-at={mark.at} data-name={mark.name} style={'left:' + (mark.at / LAST) * 100 + '%'}>{mark.name}</span>
					}
				</div>
			</div>
		</div>
		<figcaption class="sr">
			A pen-and-ink pop-up book, open on a desk. The left page is labelled while we build your app: the order code lifts off it as paper cutouts,
			threads tie each status to the one it means, every cutout is stamped with its job, and everything that never changes folds flat. The rest
			folds shut into a map that crosses the gutter to the right page, labelled in your visitor's browser, where it pops open beside the order
			page and is wired to it. A timeline under the book plays the story once on its own; its play and pause button and its slider let you
			drag, click or arrow to any moment, forwards or backwards, through the chapters Read, Tie, Stamp, Fold, Ship and Tap. The usual way
			switch shows the browser working the map out on the visitor's device instead. At the end of the story, Mark ready, or Enter or Space on
			it, runs the click and redraws only the status line. Escape resets it.
		</figcaption>
		<p class="sr" aria-live="polite">{says}</p>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.popup {
				margin: var(--space-m) 0;
				container-type: inline-size;
				--p: 0;
			}

			.stage {
				position: relative;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--shade: color-mix(in oklch, var(--ink) 18%, transparent);
				--shade-ink: var(--ink);
				--cloth: color-mix(in oklch, var(--paper) 40%, oklch(62% 0.07 55));
				--red: oklch(52% 0.19 27);
				--c-kw: #d73a49;
				--c-fn: #6f42c1;
				--c-str: #032f62;
				--c-tag: #22863a;
				--c-plain: var(--ink);

				html.dark & {
					--sheet: color-mix(in oklch, var(--paper) 84%, var(--ink));
					--shade: rgb(0 0 0 / 0.45);
					--shade-ink: rgb(0 0 0 / 0.85);
					--cloth: oklch(38% 0.05 55);
					--red: oklch(70% 0.17 27);
					--c-kw: #f97583;
					--c-fn: #b392f0;
					--c-str: #9ecbff;
					--c-tag: #85e89d;
				}
			}

			.scene.tall {
				display: none;
			}

			.overlay {
				position: absolute;
				inset: 0;
				pointer-events: none;
			}

			.hit {
				fill: transparent;
				pointer-events: auto;
				outline: none;
				cursor: pointer;
			}

			.hit[aria-disabled='true'] {
				cursor: default;
			}

			.hit:focus-visible {
				stroke: var(--ink);
				stroke-width: 1.2;
				stroke-dasharray: 4 3;
			}

			.sheet {
				fill: var(--sheet);
			}

			.shade {
				fill: color-mix(in oklch, var(--sheet) 70%, var(--ink));
			}

			.edge {
				fill: color-mix(in oklch, var(--sheet) 80%, var(--ink));
			}

			.cloth {
				fill: var(--cloth);
			}

			.ink {
				fill: var(--ink);
			}

			.light {
				opacity: 0.5;
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
			}

			.leaves {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.15;
				opacity: 0.6;
			}

			.deep {
				stroke: var(--shade-ink);
			}

			.shadow-wash {
				fill: var(--shade);
			}

			.soft {
				opacity: 0.4;
			}

			.pencil {
				fill: none;
				stroke: color-mix(in srgb, var(--pink) 70%, #e0603c);
				stroke-width: 0.6;
				stroke-linecap: round;
				opacity: 0.3;

				html.dark & {
					opacity: 0.18;
				}
			}

			.leftover > text,
			.leftover .stamp > * {
				opacity: calc(1 - 0.5 * clamp(0, (var(--p) - 3.4) / 0.5, 1));
			}

			.code {
				font-family: var(--font-mono);
				font-variation-settings: 'MONO' 1, 'CASL' 1;
				font-weight: 600;
				white-space: pre;
			}

			.hand,
			.kind,
			.stamp text {
				font-family: 'Joy Elia', system-ui, sans-serif;
			}

			.hand {
				fill: color-mix(in oklch, var(--ink) 88%, transparent);
			}

			.head {
				fill: var(--ink);
			}

			.kind {
				letter-spacing: 0.08em;
				fill: color-mix(in oklch, var(--ink) 78%, transparent);
			}

			.url {
				font-family: var(--font-mono);
				fill: color-mix(in oklch, var(--ink) 70%, transparent);
			}

			.usual-caption,
			.tick {
				display: none;
			}

			.stage[data-usual='yes'] {
				.usual-caption,
				.tick {
					display: inline;
				}

				.steps .win,
				.kept,
				.map,
				.pulse {
					visibility: hidden;
				}

				.cards {
					visibility: hidden;
				}

				.listing {
					opacity: 0.55;
				}
			}

			.stamp {
				transform-box: view-box;
				transform-origin: var(--sx) var(--sy);
				transform: rotate(-1.5deg) scale(calc(1 + 0.7 * (1 - clamp(0, (var(--p) - var(--a)) / (var(--b) - var(--a)), 1))));
			}

			.stamp text {
				fill: currentColor;
			}

			.stamp-box {
				fill: none;
				stroke: currentColor;
				stroke-width: 0.9;
				stroke-linecap: round;
			}

			.stamp.once {
				color: color-mix(in oklch, var(--ink) 80%, transparent);
			}

			.stamp.live {
				color: var(--red);
			}

			.kw {
				fill: var(--c-kw);
			}

			.fn {
				fill: var(--c-fn);
			}

			.str {
				fill: var(--c-str);
			}

			.tag {
				fill: var(--c-tag);
			}

			.plain {
				fill: var(--c-plain);
			}

			.red-ink {
				fill: var(--red);
			}

			.thread,
			.string,
			.link {
				fill: none;
				stroke-linecap: round;
				stroke-linejoin: round;
			}

			.thread {
				stroke: color-mix(in oklch, var(--ink) 55%, transparent);
				stroke-width: 1.1;
				stroke-dasharray: 4 2.5;
			}

			.string {
				stroke: var(--red);
				stroke-width: 1.5;
			}

			.link {
				stroke: color-mix(in oklch, var(--red) 75%, transparent);
				stroke-width: 1.1;
				stroke-dasharray: 5 2.5;
			}

			.pin-head {
				fill: var(--red);
			}

			.glint {
				fill: none;
				stroke: var(--sheet);
				stroke-width: 0.9;
				stroke-linecap: round;
			}

			.said {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-weight: 600;
				fill: var(--ink);
			}

			.wash {
				stroke-width: 1.2;
				mix-blend-mode: multiply;
			}

			.pink {
				fill: var(--pink);
				stroke: var(--pink);
				opacity: 0.7;

				html.dark & {
					opacity: 0.4;
				}
			}

			.yellow {
				fill: var(--yellow);
				stroke: var(--yellow);
				opacity: 0.85;

				html.dark & {
					opacity: 0.3;
				}
			}

			.wash-edge {
				fill: none;
				stroke: oklch(72% 0.15 75);
				stroke-width: 1;
				opacity: 0.55;
				mix-blend-mode: multiply;
			}

			.win {
				opacity: min(clamp(0, calc((var(--p) - var(--a)) / (var(--b) - var(--a))), 1), clamp(0, calc((var(--d) - var(--p)) / (var(--d) - var(--c))), 1));
			}

			.spot.b,
			.strike,
			.stage[data-struck='yes'] .spot.a {
				display: none;
			}

			.stage[data-struck='yes'] .spot.b,
			.stage[data-struck='yes'] .strike {
				display: inline;
			}

			.stage[data-struck='yes'] .first {
				opacity: 0.5;
			}

			.stage[data-changed='yes'] .first {
				animation: var(--dim) 300ms calc(var(--t0) + 1250ms) ease-out both;
			}

			.strike {
				fill: none;
				stroke: var(--ink);
				stroke-width: 1.3;
				stroke-linecap: round;
				stroke-dasharray: var(--l);
			}

			.pulse {
				fill: none;
				stroke: var(--yellow);
				stroke-width: 5;
				stroke-linecap: round;
				stroke-dasharray: 5 100000;
				opacity: 0;
			}

			.cursor,
			.usual {
				display: none;
			}

			.stage[data-usual='yes'] .usual {
				display: inline;
			}

			.stage[data-by='auto'] {
				--t0: 900ms;
			}

			.stage[data-by='user'] {
				--t0: 0ms;
			}

			.stage[data-beat='odd'] {
				--run: run-a;
				--strike: strike-a;
				--ink-in: ink-in-a;
				--wash-in: wash-in-a;
				--cur: cursor-a;
				--sink: sink-a;
				--dim: dim-a;
			}

			.stage[data-beat='even'] {
				--run: run-b;
				--strike: strike-b;
				--ink-in: ink-in-b;
				--wash-in: wash-in-b;
				--cur: cursor-b;
				--sink: sink-b;
				--dim: dim-b;
			}

			.stage[data-by='auto']:not([data-beat='rest']) .cursor {
				display: inline;
				animation: var(--cur) 1500ms ease-in-out both;
			}

			.stage:not([data-beat='rest']) {
				.btn {
					animation: var(--sink) 260ms calc(var(--t0) - 80ms) ease-out both;
				}

				.pulse {
					animation: var(--run) 1200ms var(--t0) ease-in-out both;
				}
			}

			.stage[data-changed='yes'] .strike {
				animation: var(--strike) 280ms calc(var(--t0) + 1250ms) ease-out both;
			}

			.stage[data-changed='yes'] .now {
				stroke: var(--ink);
				stroke-width: 0.2;
				stroke-dasharray: 60;
				animation: var(--ink-in) 600ms calc(var(--t0) + 1400ms) ease-out both;
			}

			.stage[data-changed='yes'] .spot.b {
				animation: var(--wash-in) 500ms calc(var(--t0) + 1500ms) ease-out both;
			}

			.glass {
				opacity: 0;
			}

			.usual-card {
				opacity: 0.85;
			}

			.stage[data-usual='yes'] {
				.glass {
					animation: scurry 3400ms var(--delay) ease-in-out both;
				}

				.usual-card:not(.found) {
					animation: fade-out 600ms 3600ms ease-out both;
				}

				.usual-card.found .pencil {
					animation: ink-up 600ms 3600ms ease-out both;
				}
			}

			.faint {
				opacity: 0.6;
			}

			.dark {
				opacity: 0.75;
				stroke: var(--ink);
			}

			@keyframes scurry {
				0% {
					opacity: 0;
					transform: translate(var(--x0), var(--y0));
				}

				8% {
					opacity: 1;
				}

				25% {
					transform: translate(var(--x1), var(--y1));
				}

				50% {
					transform: translate(var(--x2), var(--y2));
				}

				75% {
					transform: translate(var(--x3), var(--y3));
				}

				92% {
					opacity: 1;
				}

				100% {
					opacity: 0;
					transform: translate(var(--x3), var(--y3));
				}
			}

			@keyframes fade-out {
				to {
					opacity: 0.25;
				}
			}

			@keyframes ink-up {
				to {
					opacity: 1;
					stroke-width: 1.1;
				}
			}

			@keyframes appear {
				to {
					opacity: 0.8;
				}
			}

			@keyframes cursor-a {
				0% {
					opacity: 0;
					transform: translate(70px, 60px);
				}

				15% {
					opacity: 1;
				}

				55% {
					transform: translate(0, 0) scale(1);
				}

				62% {
					transform: translate(0, 0) scale(0.82);
				}

				70% {
					transform: translate(0, 0) scale(1);
				}

				85% {
					opacity: 1;
				}

				100% {
					opacity: 0;
					transform: translate(14px, 12px);
				}
			}

			@keyframes cursor-b {
				0% {
					opacity: 0;
					transform: translate(70px, 60px);
				}

				15% {
					opacity: 1;
				}

				55% {
					transform: translate(0, 0) scale(1);
				}

				62% {
					transform: translate(0, 0) scale(0.82);
				}

				70% {
					transform: translate(0, 0) scale(1);
				}

				85% {
					opacity: 1;
				}

				100% {
					opacity: 0;
					transform: translate(14px, 12px);
				}
			}

			@keyframes dim-a {
				from {
					opacity: 1;
				}
			}

			@keyframes dim-b {
				from {
					opacity: 1;
				}
			}

			@keyframes sink-a {
				50% {
					transform: translate(0.6px, 1.4px);
				}
			}

			@keyframes sink-b {
				50% {
					transform: translate(0.6px, 1.4px);
				}
			}

			@keyframes run-a {
				0%,
				96% {
					opacity: 1;
				}

				0% {
					stroke-dashoffset: 0;
				}

				100% {
					opacity: 0;
					stroke-dashoffset: calc(var(--l) * -1);
				}
			}

			@keyframes run-b {
				0%,
				96% {
					opacity: 1;
				}

				0% {
					stroke-dashoffset: 0;
				}

				100% {
					opacity: 0;
					stroke-dashoffset: calc(var(--l) * -1);
				}
			}

			@keyframes strike-a {
				from {
					stroke-dashoffset: var(--l);
				}

				to {
					stroke-dashoffset: 0;
				}
			}

			@keyframes strike-b {
				from {
					stroke-dashoffset: var(--l);
				}

				to {
					stroke-dashoffset: 0;
				}
			}

			@keyframes ink-in-a {
				from {
					stroke-dashoffset: 60;
					fill-opacity: 0;
					opacity: 0;
				}

				35% {
					opacity: 1;
				}

				55% {
					fill-opacity: 0;
				}

				to {
					stroke-dashoffset: 0;
					fill-opacity: 1;
				}
			}

			@keyframes ink-in-b {
				from {
					stroke-dashoffset: 60;
					fill-opacity: 0;
					opacity: 0;
				}

				35% {
					opacity: 1;
				}

				55% {
					fill-opacity: 0;
				}

				to {
					stroke-dashoffset: 0;
					fill-opacity: 1;
				}
			}

			@keyframes wash-in-a {
				from {
					opacity: 0;
				}
			}

			@keyframes wash-in-b {
				from {
					opacity: 0;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.scene * {
					animation: none !important;
					transition: none !important;
				}

				.stamp {
					transform: rotate(-1.5deg);
				}

				.cursor {
					display: none !important;
				}
			}

			@container (max-width: 520px) {
				.scene.wide {
					display: none;
				}

				.scene.tall {
					display: block;
				}
			}

			.timeline {
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				display: flex;
				align-items: flex-start;
				gap: 14px;
				padding: 2px 22px 0 4px;
				height: 64px;

				html.dark & {
					--sheet: color-mix(in oklch, var(--paper) 84%, var(--ink));
				}
			}

			.play {
				flex: none;
				width: 40px;
				height: 40px;
				padding: 0;
				border: 0;
				border-radius: 50%;
				background: none;
				color: inherit;
				cursor: pointer;

				svg {
					display: block;
					width: 100%;
					height: 100%;
					overflow: visible;
				}

				&:focus-visible {
					outline: 2px dashed var(--ink);
					outline-offset: 3px;
				}
			}

			.icon-pause,
			.play[aria-pressed='true'] .icon-play {
				display: none;
			}

			.play[aria-pressed='true'] .icon-pause {
				display: inline;
			}

			.rail {
				position: relative;
				flex: 1;
				min-width: 0;
			}

			.track {
				position: relative;
				height: 40px;
				touch-action: none;
				cursor: pointer;
			}

			.rail-ink {
				position: absolute;
				left: 0;
				top: 8px;
				width: 100%;
				height: 24px;
				overflow: visible;
			}

			.rail-ink.tall {
				display: none;
			}

			.thumb {
				position: absolute;
				left: var(--slider-offset);
				top: 50%;
				width: 22px;
				height: 22px;
				transform: translate(-50%, -50%);
				border-radius: 50%;
				outline: none;
				cursor: grab;

				svg {
					display: block;
					width: 100%;
					height: 100%;
					overflow: visible;
				}

				&[ui-dragging] {
					cursor: grabbing;
				}

				&:focus-visible {
					outline: 2px dashed var(--ink);
					outline-offset: 3px;
				}
			}

			.chapters {
				position: relative;
				height: 20px;
			}

			.chapter {
				position: absolute;
				top: -2px;
				transform: translateX(-50%);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 15px;
				line-height: 1;
				white-space: nowrap;
				color: color-mix(in oklch, var(--ink) 70%, transparent);
				cursor: pointer;
				user-select: none;

				&:hover {
					color: var(--ink);
				}
			}

			.chapters[data-now='Read'] [data-name='Read'],
			.chapters[data-now='Tie'] [data-name='Tie'],
			.chapters[data-now='Stamp'] [data-name='Stamp'],
			.chapters[data-now='Fold'] [data-name='Fold'],
			.chapters[data-now='Ship'] [data-name='Ship'],
			.chapters[data-now='Tap'] [data-name='Tap'] {
				color: var(--ink);
				text-decoration: underline wavy color-mix(in oklch, var(--red, oklch(52% 0.19 27)) 70%, transparent);
				text-decoration-thickness: 1px;
				text-underline-offset: 4px;
			}

			@container (max-width: 520px) {
				.timeline {
					gap: 8px;
					padding-right: 14px;
				}

				.rail-ink.wide {
					display: none;
				}

				.rail-ink.tall {
					display: block;
				}

				.chapter {
					font-size: 13px;
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
