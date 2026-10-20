// A terminal drawn on a sheet on the desk replaying a markless-migrate run on a small shop, with the report it writes lying below: Enter runs the next command.
import { computed, state } from '@markless/core';
import { completesAt, describe, doneOf, FOOTERS, focusRow, ghostFor, interrupt, JS, labelOf, MAX_TYPED, PAGE, print, printAll, printing, reportOf, ROUTES, ROWS, type Run, runCommand, screen, servedBy, showsFooter, START, submit, TICK_MS, tour, TOUR_START, type Tour } from './model.ts';
import { art } from './migrate.art.ts';
import { recall, remember } from '../create/history.ts';

const FOOT = art.rows[ROWS - 1]!.matrix;

export default function MigrateAnatomy() @{
	let run = state(START as Run);
	let typed = state('');
	let at = state(0);
	let said = state('');
	let ran = state([] as string[]);
	let back = state(0);
	let tick = state('a');
	let touched = state(false);
	const lines = computed(() => {
		const rows = screen(run, typed, at);
		const focus = focusRow(rows);
		return art.rows.map((slot) => ({ ...slot, ...rows[slot.key]!, focus: focus === slot.key ? 'yes' : 'no' }));
	});
	const completes = computed(() => completesAt(run, typed, at));
	const label = computed(() => labelOf(run));
	const report = computed(() => reportOf(run));
	const suggesting = computed(() => (showsFooter(run, typed) ? 'yes' : 'no'));
	const served0 = computed(() => servedBy(ROUTES[0], run));
	const served1 = computed(() => servedBy(ROUTES[1], run));
	const served2 = computed(() => servedBy(ROUTES[2], run));
	const served3 = computed(() => servedBy(ROUTES[3], run));

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let seen = true;
			let t: Tour = TOUR_START;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen) return;
				if (touched) {
					if (!printing(run)) return;
					run = print(run);
					if (!printing(run)) said = describe(run);
					return;
				}
				t = tour(t);
				if (t.entered || (printing(run) && !printing(t.run))) said = describe(t.run);
				run = t.run;
				typed = t.typed;
				at = t.typed.length;
			}, TICK_MS);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
	>
		<label
			class="stage"
			data-agent={run.agent}
			data-suggesting={suggesting}
			onClick={(event) => {
				const pick = (event.target as Element).closest("[data-pick]:not([data-pick=''])")?.getAttribute('data-pick');
				if (!pick) return;
				const input = (event.target as Element).closest('.stage')!.querySelector('input')!;
				const fill = runCommand(pick);
				input.value = fill;
				typed = fill;
				at = fill.length;
				input.focus();
			}}
			onPointerDown={(event) => {
				if (touched) return;
				touched = true;
				typed = '';
				at = 0;
				const input = (event.target as Element).closest('.stage')!.querySelector('input')!;
				input.value = '';
			}}
		>
			<input
				class="line-in"
				type="text"
				aria-label={label}
				maxlength={MAX_TYPED}
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				enterkeyhint="go"
				onFocus={(event) => {
					if (touched) return;
					touched = true;
					typed = '';
					at = 0;
					(event.target as HTMLInputElement).value = '';
				}}
				onInput={(event) => {
					const input = event.target as HTMLInputElement;
					touched = true;
					typed = input.value;
					at = input.selectionStart ?? input.value.length;
					tick = tick === 'a' ? 'b' : 'a';
				}}
				onSelectionChange={(event) => {
					const input = event.target as HTMLInputElement;
					const next = input.selectionStart ?? input.value.length;
					if (next === at) return;
					at = next;
					tick = tick === 'a' ? 'b' : 'a';
				}}
				onKeyDown={(event) => {
					touched = true;
					if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || (event.key === 'c' && event.ctrlKey === true) || (event.key === 'Tab' && event.shiftKey === false && completes)) event.preventDefault();
					const input = event.target as HTMLInputElement;
					if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
						const step = recall(ran, back, event.key === 'ArrowUp' ? 1 : -1);
						if (!step) return;
						back = step.back;
						input.value = step.line;
						typed = step.line;
						at = step.line.length;
					} else if ((event.key === 'ArrowRight' || (event.key === 'Tab' && !event.shiftKey)) && input.selectionStart === input.value.length && ghostFor(run, input.value) !== '') {
						input.value = (input.value + ghostFor(run, input.value)).slice(0, MAX_TYPED);
						typed = input.value;
						at = input.value.length;
					} else if (event.key === 'Enter') {
						const after = submit(run, input.value);
						if (after === run) return;
						const stepped = doneOf(after) > doneOf(run);
						if (stepped) ran = remember(ran, input.value.trim() || ghostFor(run, ''));
						back = 0;
						run = stepped && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? printAll(after) : after;
						said = describe(run);
						input.value = '';
						typed = '';
						at = 0;
					} else if (event.key === 'c' && event.ctrlKey) {
						back = 0;
						run = interrupt(run, input.value);
						said = describe(run);
						input.value = '';
						typed = '';
						at = 0;
					} else if (event.key === 'Escape') {
						run = START;
						ran = [];
						back = 0;
						said = 'Started over.';
						input.value = '';
						typed = '';
						at = 0;
					}
				}}
			/>
			<svg
				class="scene"
				data-tick={tick}
				data-listed={report.listed}
				data-check={report.check}
				data-live={report.live}
				viewBox={'0 0 ' + art.width + ' ' + art.height}
				aria-hidden="true"
			>
				<path class="pencil" d={art.sheet.pencil} />
				<path class="shadow-wash" d={art.report.shadow.wash} />
				<path class="hatch deep light" d={art.report.shadow.hatch} />
				<path class="hatch deep light" d={art.report.desk} />
				<path class="report-paper" d={art.report.paper} />
				<path class="pencil" d={art.report.pencil} />
				<path class="ink" d={art.report.ink} />

				<g class="list">
					<text class="head" transform={art.report.head.route}>page</text>
					<text class="head" transform={art.report.head.served}>served by</text>
					@for (const r of art.report.routes; key r.key) {
						<g class="route" data-route={r.key}>
							<path class="pencil" d={r.rule} />
							<g class="served-wash">
								<path class="wash yellow" d={r.wash} />
								<path class="wash yellow pool" d={r.pool} />
							</g>
							<text class="route-name" transform={r.route}>{ROUTES[r.key]}</text>
						</g>
					}
					<text class="served" transform={art.report.routes[0]!.served}>{served0}</text>
					<text class="served" transform={art.report.routes[1]!.served}>{served1}</text>
					<text class="served" transform={art.report.routes[2]!.served}>{served2}</text>
					<text class="served" transform={art.report.routes[3]!.served}>{served3}</text>
					<path class="ink tick" d={art.report.tick} />
					<path class="red-ink cross" d={art.report.cross} />
					<text class="hand live" transform={art.report.live}>LIVE</text>
				</g>

				<g class="shots">
					<text class="shot-label" transform={art.report.old.label}>old<tspan class="wide"> {PAGE}</tspan></text>
					<text class="shot-label" transform={art.report.fresh.label}>new<tspan class="wide"> {PAGE}</tspan></text>
					<g class="thumb">
						<path class="shadow-wash light" d={art.report.old.cast} />
						<path class="sheet-paper" d={art.report.old.paper} />
						<path class="sheet-hatch light" d={art.report.old.bar} />
						<path class="sheet-ink" d={art.report.old.ink} />
						<path class="wash pink" d={art.report.old.button.wash} />
						<path class="sheet-ink" d={art.report.old.button.ink} />
						<text class="btn" transform={art.report.old.button.matrix}>Settings</text>
						<path class="sheet-paper" d={art.report.old.panel.paper} />
						<path class="sheet-hatch light" d={art.report.old.panel.tone} />
						<path class="sheet-ink" d={art.report.old.panel.ink} />
						<path class="sheet-paper" d={art.report.old.cursor} />
						<path class="sheet-ink" d={art.report.old.cursorInk} />
					</g>
					<g class="thumb">
						<path class="shadow-wash light" d={art.report.fresh.cast} />
						<path class="sheet-paper" d={art.report.fresh.paper} />
						<path class="sheet-hatch light" d={art.report.fresh.bar} />
						<path class="sheet-ink" d={art.report.fresh.ink} />
						<path class="wash pink" d={art.report.fresh.button.wash} />
						<path class="sheet-ink" d={art.report.fresh.button.ink} />
						<text class="btn" transform={art.report.fresh.button.matrix}>Settings</text>
						<g class="fixed">
							<path class="sheet-paper" d={art.report.fresh.panel.paper} />
							<path class="sheet-hatch light" d={art.report.fresh.panel.tone} />
							<path class="sheet-ink" d={art.report.fresh.panel.ink} />
						</g>
						<g class="missing">
							<path class="pencil gap" d={art.report.fresh.gap} />
							<path class="red-ink" d={art.report.fresh.ring} />
						</g>
						<path class="sheet-paper" d={art.report.fresh.cursor} />
						<path class="sheet-ink" d={art.report.fresh.cursorInk} />
					</g>
					<text class="caption" transform={art.report.caption}>after clicking Settings</text>
				</g>
				<g class="js">
					<g>
						<path class="wash yellow" d={art.report.js.wash} />
						<path class="wash yellow pool" d={art.report.js.pool} />
					</g>
					<text class="head" transform={art.report.js.label}>JS at load</text>
					<text class="js-at" transform={art.report.jsAt}>{JS.old} → {JS.new}</text>
				</g>

				<path class="shadow-wash light" d={art.sheet.deskWash} />
				<path class="hatch deep" d={art.sheet.desk} />
				<path class="shadow-wash" d={art.sheet.curl.shadow} />
				<path class="hatch deep" d={art.sheet.curl.hatch} />
				<path class="sheet-paper" d={art.sheet.paper} />
				<path class="sheet-hatch light" d={art.sheet.bar.tone} />
				<path class="sheet-ink" d={art.sheet.bar.ink} />
				@for (const slot of lines; key slot.key) {
					<g class="row" data-kind={slot.kind} data-invalid={slot.invalid}>
						<text class="term" transform={slot.matrix}>
							<tspan class="mark">{slot.mark}</tspan>
							<tspan class="line" x="22">{slot.text}</tspan>
							<tspan class="caret">{slot.caret}</tspan>
							<tspan class="line">{slot.after}</tspan>
							<tspan class="ghost">{slot.ghost}</tspan>
							<tspan class="value" x="15em">{slot.value}</tspan>
						</text>
						<g class="focus" data-on={slot.focus}>
							<path class="sheet-ink" d={slot.pointer} />
						</g>
					</g>
				}
				<text class="term footer" transform={FOOT}>
					<tspan class="also" x="22">also: </tspan>
					@for (const footer of FOOTERS; key footer.agent) {
						<tspan class="others" data-for={footer.agent}>
							@for (const other of footer.others; key other.id) {
								<>
									<tspan class="gap">{other.gap}</tspan>
									<tspan class="pick" data-pick={other.id}>{other.id}</tspan>
								</>
							}
						</tspan>
					}
				</text>
				<path class="sheet-ink" d={art.sheet.curl.ink} />
				<path class="sheet-ink" d={art.sheet.ink} />
			</svg>
		</label>
		<figcaption class="sr">
			A pen-and-ink drawing of a desk. A sheet of paper drawn as a terminal replays a markless-migrate run on a small shop with four pages:
			/, /pricing, /account and /blog. Press Enter to run each command in turn: plan lists the pages and what it read on each; Claude
			Code converts /account; check compares the old and new /account in seven plain checks and fails one, because the new Settings button
			opens nothing; Claude Code fixes it; check runs again and passes; switch makes /account live. Below lies the report: the four pages
			and which app serves each, the old and new /account side by side, and the JavaScript run at load before and after. Arrow Up recalls
			earlier commands, Escape starts over.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
				container: anatomy / inline-size;
			}

			.stage {
				display: block;
				position: relative;
				cursor: text;
				user-select: none;
				-webkit-user-select: none;
			}

			.line-in {
				position: absolute;
				left: 10%;
				top: 2%;
				width: 80%;
				height: 50%;
				padding: 0;
				border: 0;
				font-size: 16px;
				opacity: 0;
				pointer-events: none;
			}

			.row[data-invalid='yes'] .line,
			.row[data-kind='fail'] :is(.line, .mark),
			.red-ink {
				fill: var(--red);
			}

			.focus,
			.caret {
				visibility: hidden;
			}

			.stage:focus-within .focus[data-on='yes'],
			.stage:has(.line-in:focus) .caret {
				visibility: visible;
			}

			.caret {
				font-weight: 700;
				animation: blink-a 1.06s steps(1) infinite;
			}

			.scene[data-tick='b'] .caret {
				animation-name: blink-b;
			}

			@keyframes blink-a {
				50% {
					opacity: 0;
				}
			}

			@keyframes blink-b {
				50% {
					opacity: 0;
				}
			}

			.ghost {
				opacity: 0.32;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--report: color-mix(in oklch, var(--paper) 70%, white);
				--sheet-ink: var(--ink);
				--shade: color-mix(in oklch, var(--ink) 24%, transparent);
				--shade-ink: var(--ink);
				--red: oklch(52% 0.19 27);

				html.dark & {
					--red: oklch(55% 0.2 27);
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--report: color-mix(in oklch, var(--ink) 90%, var(--yellow));
					--sheet-ink: var(--paper);
					--shade: rgb(0 0 0 / 0.55);
					--shade-ink: rgb(0 0 0 / 0.85);
				}
			}

			.sheet-paper {
				fill: var(--sheet);
			}

			.report-paper {
				fill: var(--report);
			}

			.sheet-ink,
			.ink {
				fill: var(--sheet-ink);
			}

			.sheet-hatch {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.6;
				stroke-linecap: round;
				opacity: 0.8;
			}

			.light {
				opacity: 0.55;
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.75;
				stroke-linecap: round;
			}

			.deep {
				stroke: var(--shade-ink);
			}

			.shadow-wash {
				fill: var(--shade);
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

				html.dark & {
					opacity: 0.45;
				}
			}

			.pink {
				fill: var(--pink);
				stroke: var(--pink);
				opacity: 0.6;
			}

			.pool {
				fill: color-mix(in oklch, var(--yellow) 70%, oklch(70% 0.16 70));
				stroke: none;
				opacity: 0.5;
			}

			.term,
			.route-name,
			.served,
			.head,
			.shot-label,
			.btn,
			.js-at {
				font-family: var(--font-mono);
				fill: var(--sheet-ink);
			}

			.term {
				font-size: 14px;
				white-space: pre;
				font-variant-ligatures: none;
			}

			.value {
				opacity: 0.45;
			}

			.mark {
				opacity: 0.7;
			}

			.row:is([data-kind='cmd'], [data-kind='input'], [data-kind='head'], [data-kind='agent'], [data-kind='fail']) .line,
			.row[data-kind='start'] .line {
				font-weight: 700;
			}

			.row:is([data-kind='pass'], [data-kind='fail']) .mark {
				opacity: 1;
				font-weight: 700;
			}

			.row:is([data-kind='path'], [data-kind='reason'], [data-kind='try']) .line {
				opacity: 0.62;
			}

			.row[data-kind='start'] .line {
				opacity: 0.55;
			}

			.route-name {
				font-size: 15px;
				font-weight: 700;
			}

			.served {
				font-size: 14px;
			}

			.head {
				font-size: 11px;
				opacity: 0.55;
			}

			.shot-label {
				font-size: 11px;
				font-weight: 700;
			}

			.btn {
				font-size: 6.5px;
				font-weight: 700;
			}

			.caption {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 13px;
				fill: var(--sheet-ink);
			}

			.js-at {
				font-size: 14px;
				font-weight: 700;
			}

			.hand {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 14px;
				letter-spacing: 0.14em;
				fill: var(--sheet-ink);
			}

			.pencil {
				fill: none;
				stroke: color-mix(in srgb, var(--pink) 70%, #e0603c);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.5;

				html.dark & {
					opacity: 0.32;
				}
			}

			.pencil.gap {
				stroke: var(--sheet-ink);
				stroke-dasharray: 2 2;
				opacity: 0.5;
			}

			.scene[data-listed='no'] .list,
			.scene:not([data-check='red']) :is(.cross, .missing),
			.scene[data-check='red'] .fixed,
			.scene:not([data-check='green']) .tick,
			.scene[data-check='none'] .shots,
			.scene:not([data-check='green']) .js,
			.scene[data-live='no'] :is(.live, .served-wash),
			.scene[data-live='yes'] .tick,
			.route:not([data-route='2']) .served-wash {
				opacity: 0;
			}

			:is(.list, .shots, .cross, .tick, .js, .fixed, .missing, .served-wash, .live) {
				transition: opacity 0.4s ease-out;
			}

			.term.footer {
				font-size: 12px;
				opacity: 0.5;
				visibility: hidden;
			}

			.stage[data-suggesting='yes'] .footer {
				visibility: visible;
			}

			.others {
				display: none;
			}

			.stage[data-agent='claude'] .others[data-for='claude'],
			.stage[data-agent='codex'] .others[data-for='codex'],
			.stage[data-agent='cursor'] .others[data-for='cursor'],
			.stage[data-agent='gemini'] .others[data-for='gemini'],
			.stage[data-agent='copilot'] .others[data-for='copilot'],
			.stage[data-agent='opencode'] .others[data-for='opencode'] {
				display: inline;
			}

			.pick {
				cursor: pointer;
			}

			.pick:hover {
				text-decoration: underline;
			}

			@container anatomy (max-width: 520px) {
				.term {
					font-size: 17px;
				}

				.term.footer {
					font-size: 15px;
				}

				.route-name,
				.served,
				.js-at {
					font-size: 16px;
				}

				.wide {
					display: none;
				}

				.head,
				.shot-label {
					font-size: 14px;
				}

				.caption,
				.hand {
					font-size: 16px;
				}

				.hand {
					letter-spacing: 0.04em;
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
		</style>
	</figure>
}
