// A terminal drawn on a sheet on the desk: type the create command, answer the real prompts, and the starter's files drop into the folder below as paper sheets that say what they are for.
import { computed, state } from '@markless/core';
import { choose, COMMAND, cursorRow, describe, flip, focusRow, ghostFor, labelOf, landed, MAX_TYPED, move, noteAt, type Run, screen, slipAt, START, submit, tabOf, typing, widthOf } from './model.ts';
import { art } from './create.art.ts';
import { recall, remember } from './history.ts';

export default function CreateAnatomy() @{
	let run = state(START as Run);
	let typed = state('');
	let at = state(0);
	let beat = state('rest');
	let said = state('');
	let peek = state(-1);
	let ran = state([] as string[]);
	let back = state(0);
	let tick = state('a');
	const lines = computed(() => {
		const rows = screen(run, typed, at);
		const cursor = cursorRow(rows);
		const focus = focusRow(rows);
		return art.rows.map((slot) => ({ ...slot, ...rows[slot.key]!, on: cursor === slot.key ? 'yes' : 'no', focus: focus === slot.key ? 'yes' : 'no', fit: slot.origin + ';--w:' + widthOf(rows[slot.key]!) }));
	});
	const count = computed(() => '--n:' + landed(run).length);
	const tab = computed(() => tabOf(run));
	const label = computed(() => labelOf(run));
	const mode = computed(() => typing(run));
	const shown = computed(() => noteAt(run, peek));
	const s0 = computed(() => slipAt(run, 0, peek));
	const s1 = computed(() => slipAt(run, 1, peek));
	const s2 = computed(() => slipAt(run, 2, peek));
	const s3 = computed(() => slipAt(run, 3, peek));
	const s4 = computed(() => slipAt(run, 4, peek));
	const s5 = computed(() => slipAt(run, 5, peek));
	const s6 = computed(() => slipAt(run, 6, peek));
	const s7 = computed(() => slipAt(run, 7, peek));
	const s8 = computed(() => slipAt(run, 8, peek));
	const s9 = computed(() => slipAt(run, 9, peek));
	const s10 = computed(() => slipAt(run, 10, peek));
	const s11 = computed(() => slipAt(run, 11, peek));
	const s12 = computed(() => slipAt(run, 12, peek));
	const s13 = computed(() => slipAt(run, 13, peek));
	const s14 = computed(() => slipAt(run, 14, peek));
	const s15 = computed(() => slipAt(run, 15, peek));

	<figure class="anatomy">
		<label
			class="stage"
			data-typing={mode}
			onClick={(event) => {
				const target = event.target as Element;
				const input = target.closest('.stage')!.querySelector('input')!;
				const sheet = target.closest('[data-on="yes"][data-slot]');
				if (sheet) {
					peek = Number(sheet.getAttribute('data-slot'));
					input.focus();
					return;
				}
				const option = Number(target.closest('[data-option]')?.getAttribute('data-option') ?? -1);
				const after = choose(run, option);
				if (after !== run) {
					if (after.outcome === 'created') beat = flip(beat);
					run = after;
					said = describe(after);
					input.value = '';
					typed = '';
					at = 0;
				}
				input.focus();
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
				onInput={(event) => {
					const input = event.target as HTMLInputElement;
					if (typing(run) === 'none') input.value = '';
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
					if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') event.preventDefault();
					const input = event.target as HTMLInputElement;
					if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
						if (typing(run) === 'shell') {
							const step = recall(ran, back, event.key === 'ArrowUp' ? 1 : -1);
							if (!step) return;
							back = step.back;
							input.value = step.line;
							typed = step.line;
							at = step.line.length;
							return;
						}
						if (typing(run) !== 'none') return;
						run = move(run, event.key === 'ArrowDown' ? 1 : -1);
						said = describe(run, true);
					} else if (event.key === 'ArrowRight' && input.selectionStart === input.value.length && ghostFor(run, input.value) !== '') {
						input.value = (input.value + ghostFor(run, input.value)).slice(0, MAX_TYPED);
						typed = input.value;
						at = input.value.length;
					} else if (event.key === 'Enter') {
						if (typing(run) === 'shell') ran = remember(ran, input.value.trim() || COMMAND);
						back = 0;
						const after = submit(run, input.value);
						if (after.outcome === 'created' && run.outcome === 'asking') beat = flip(beat);
						else if (after.outcome === 'asking' && run.outcome !== 'asking') beat = 'rest';
						run = after;
						said = describe(after);
						input.value = '';
						typed = '';
						at = 0;
						peek = -1;
					} else if (event.key === 'Escape') {
						run = START;
						back = 0;
						beat = 'rest';
						said = '';
						input.value = '';
						typed = '';
						at = 0;
						peek = -1;
					}
				}}
			/>
			<svg
				class="scene"
				style={count}
				data-beat={beat}
				data-tick={tick}
				data-made={run.outcome === 'created' ? 'yes' : 'no'}
				viewBox={'0 0 ' + art.width + ' ' + art.height}
				role="group"
				aria-label="The folder the command writes"
				onPointerOver={(event) => {
					const sheet = (event.target as Element).closest('[data-slot]');
					const slot = sheet ? Number(sheet.getAttribute('data-slot')) : -1;
					if (slot !== peek && (slot >= 0 || event.pointerType === 'mouse')) peek = slot;
				}}
				onFocusIn={(event) => {
					const sheet = (event.target as Element).closest('[data-slot]');
					if (sheet) peek = Number(sheet.getAttribute('data-slot'));
				}}
			>
				<g aria-hidden="true">
				<path class="pencil" d={art.sheet.pencil} />
				<path class="pencil" d={art.folder.pencil} />
				<path class="shadow-wash" d={art.folder.shadow.wash} />
				<path class="hatch deep light" d={art.folder.shadow.hatch} />
				<path class="hatch deep light" d={art.folder.desk} />
				<path class="sheet-hatch" d={art.folder.thick} />
				<path class="kraft" d={art.folder.paper} />
				<path class="sheet-hatch light" d={art.folder.tone} />
				<path class="ink" d={art.folder.crease} />
				<path class="ink" d={art.folder.ink} />
				<text class="tab" transform={art.folder.tabMatrix}>{tab}</text>
				<g class="cover" style={art.folder.cover.origin}>
					<path class="hatch deep" d={art.folder.cover.gap} />
					<path class="cover-paper" d={art.folder.cover.paper} />
					<path class="sheet-hatch light" d={art.folder.cover.tone} />
					<path class="kraft-inside" d={art.folder.cover.flap} />
					<path class="ink" d={art.folder.cover.ink} />
				</g>

				<path class="shadow-wash light" d={art.sheet.deskWash} />
				<path class="hatch deep" d={art.sheet.desk} />
				<path class="shadow-wash" d={art.sheet.curl.shadow} />
				<path class="hatch deep" d={art.sheet.curl.hatch} />
				<path class="sheet-paper" d={art.sheet.paper} />
				<path class="sheet-hatch light" d={art.sheet.bar.tone} />
				<path class="sheet-ink" d={art.sheet.bar.ink} />
				@for (const slot of lines; key slot.key) {
					<g class="row" data-option={slot.option} data-kind={slot.kind}>
						<g class="cursor" style={slot.fit} data-on={slot.on}>
							<path class="wash pink" d={slot.wash} />
							<path class="wash pink pool" d={slot.pool} />
						</g>
						<path class="hit" d={slot.wash} />
						<text class="term" transform={slot.matrix}>
							<tspan class="mark">{slot.mark}</tspan>
							<tspan class="line" x="30">{slot.text}</tspan>
							<tspan class="caret">{slot.caret}</tspan>
							<tspan class="line">{slot.after}</tspan>
							<tspan class="ghost">{slot.ghost}</tspan>
							<tspan class="value" x="104">{slot.value}</tspan>
							<tspan class="hint" x="46">{slot.hint}</tspan>
						</text>
						<g class="focus" data-on={slot.focus}>
							<path class="sheet-ink under" style={slot.fit} d={slot.underline} />
							<path class="sheet-ink" d={slot.pointer} />
						</g>
					</g>
				}
				<path class="sheet-ink" d={art.sheet.curl.ink} />
				<path class="sheet-ink" d={art.sheet.ink} />

				</g>
				<g class="slip" style={art.slips[0]!.origin + s0.order} data-on={s0.on} data-peek={s0.peek} data-slot="0" tabindex={s0.tab} role="img" aria-label={s0.path} aria-description={s0.note}>
					<path class="shadow-wash" d={art.slips[0]!.cast} />
					<path class="sheet-paper" d={art.slips[0]!.paper} />
					<path class="wash pink peek-wash" d={art.slips[0]!.wash} />
					<path class="sheet-hatch light" d={art.slips[0]!.fold} />
					<path class="sheet-ink type" d={art.slips[0]!.rules} />
					<path class="sheet-ink" d={art.slips[0]!.ink} />
					<text class="file" transform={art.slips[0]!.nameMatrix}><tspan class="dir">{s0.dir}</tspan>{s0.name}</text>
				</g>
				<g class="slip" style={art.slips[1]!.origin + s1.order} data-on={s1.on} data-peek={s1.peek} data-slot="1" tabindex={s1.tab} role="img" aria-label={s1.path} aria-description={s1.note}>
					<path class="shadow-wash" d={art.slips[1]!.cast} />
					<path class="sheet-paper" d={art.slips[1]!.paper} />
					<path class="wash pink peek-wash" d={art.slips[1]!.wash} />
					<path class="sheet-hatch light" d={art.slips[1]!.fold} />
					<path class="sheet-ink type" d={art.slips[1]!.rules} />
					<path class="sheet-ink" d={art.slips[1]!.ink} />
					<text class="file" transform={art.slips[1]!.nameMatrix}><tspan class="dir">{s1.dir}</tspan>{s1.name}</text>
				</g>
				<g class="slip" style={art.slips[2]!.origin + s2.order} data-on={s2.on} data-peek={s2.peek} data-slot="2" tabindex={s2.tab} role="img" aria-label={s2.path} aria-description={s2.note}>
					<path class="shadow-wash" d={art.slips[2]!.cast} />
					<path class="sheet-paper" d={art.slips[2]!.paper} />
					<path class="wash pink peek-wash" d={art.slips[2]!.wash} />
					<path class="sheet-hatch light" d={art.slips[2]!.fold} />
					<path class="sheet-ink type" d={art.slips[2]!.rules} />
					<path class="sheet-ink" d={art.slips[2]!.ink} />
					<text class="file" transform={art.slips[2]!.nameMatrix}><tspan class="dir">{s2.dir}</tspan>{s2.name}</text>
				</g>
				<g class="slip" style={art.slips[3]!.origin + s3.order} data-on={s3.on} data-peek={s3.peek} data-slot="3" tabindex={s3.tab} role="img" aria-label={s3.path} aria-description={s3.note}>
					<path class="shadow-wash" d={art.slips[3]!.cast} />
					<path class="sheet-paper" d={art.slips[3]!.paper} />
					<path class="wash pink peek-wash" d={art.slips[3]!.wash} />
					<path class="sheet-hatch light" d={art.slips[3]!.fold} />
					<path class="sheet-ink type" d={art.slips[3]!.rules} />
					<path class="sheet-ink" d={art.slips[3]!.ink} />
					<text class="file" transform={art.slips[3]!.nameMatrix}><tspan class="dir">{s3.dir}</tspan>{s3.name}</text>
				</g>
				<g class="slip" style={art.slips[4]!.origin + s4.order} data-on={s4.on} data-peek={s4.peek} data-slot="4" tabindex={s4.tab} role="img" aria-label={s4.path} aria-description={s4.note}>
					<path class="shadow-wash" d={art.slips[4]!.cast} />
					<path class="sheet-paper" d={art.slips[4]!.paper} />
					<path class="wash pink peek-wash" d={art.slips[4]!.wash} />
					<path class="sheet-hatch light" d={art.slips[4]!.fold} />
					<path class="sheet-ink type" d={art.slips[4]!.rules} />
					<path class="sheet-ink" d={art.slips[4]!.ink} />
					<text class="file" transform={art.slips[4]!.nameMatrix}><tspan class="dir">{s4.dir}</tspan>{s4.name}</text>
				</g>
				<g class="slip" style={art.slips[5]!.origin + s5.order} data-on={s5.on} data-peek={s5.peek} data-slot="5" tabindex={s5.tab} role="img" aria-label={s5.path} aria-description={s5.note}>
					<path class="shadow-wash" d={art.slips[5]!.cast} />
					<path class="sheet-paper" d={art.slips[5]!.paper} />
					<path class="wash pink peek-wash" d={art.slips[5]!.wash} />
					<path class="sheet-hatch light" d={art.slips[5]!.fold} />
					<path class="sheet-ink type" d={art.slips[5]!.rules} />
					<path class="sheet-ink" d={art.slips[5]!.ink} />
					<text class="file" transform={art.slips[5]!.nameMatrix}><tspan class="dir">{s5.dir}</tspan>{s5.name}</text>
				</g>
				<g class="slip" style={art.slips[6]!.origin + s6.order} data-on={s6.on} data-peek={s6.peek} data-slot="6" tabindex={s6.tab} role="img" aria-label={s6.path} aria-description={s6.note}>
					<path class="shadow-wash" d={art.slips[6]!.cast} />
					<path class="sheet-paper" d={art.slips[6]!.paper} />
					<path class="wash pink peek-wash" d={art.slips[6]!.wash} />
					<path class="sheet-hatch light" d={art.slips[6]!.fold} />
					<path class="sheet-ink type" d={art.slips[6]!.rules} />
					<path class="sheet-ink" d={art.slips[6]!.ink} />
					<text class="file" transform={art.slips[6]!.nameMatrix}><tspan class="dir">{s6.dir}</tspan>{s6.name}</text>
				</g>
				<g class="slip" style={art.slips[7]!.origin + s7.order} data-on={s7.on} data-peek={s7.peek} data-slot="7" tabindex={s7.tab} role="img" aria-label={s7.path} aria-description={s7.note}>
					<path class="shadow-wash" d={art.slips[7]!.cast} />
					<path class="sheet-paper" d={art.slips[7]!.paper} />
					<path class="wash pink peek-wash" d={art.slips[7]!.wash} />
					<path class="sheet-hatch light" d={art.slips[7]!.fold} />
					<path class="sheet-ink type" d={art.slips[7]!.rules} />
					<path class="sheet-ink" d={art.slips[7]!.ink} />
					<text class="file" transform={art.slips[7]!.nameMatrix}><tspan class="dir">{s7.dir}</tspan>{s7.name}</text>
				</g>
				<g class="slip" style={art.slips[8]!.origin + s8.order} data-on={s8.on} data-peek={s8.peek} data-slot="8" tabindex={s8.tab} role="img" aria-label={s8.path} aria-description={s8.note}>
					<path class="shadow-wash" d={art.slips[8]!.cast} />
					<path class="sheet-paper" d={art.slips[8]!.paper} />
					<path class="wash pink peek-wash" d={art.slips[8]!.wash} />
					<g class="page-wash">
						<path class="wash yellow" d={art.slips[8]!.wash} />
						<path class="wash yellow pool" d={art.slips[8]!.pool} />
					</g>
					<path class="sheet-hatch light" d={art.slips[8]!.fold} />
					<path class="sheet-ink type" d={art.slips[8]!.rules} />
					<path class="sheet-ink" d={art.slips[8]!.ink} />
					<text class="file" transform={art.slips[8]!.nameMatrix}><tspan class="dir">{s8.dir}</tspan>{s8.name}</text>
				</g>
				<g class="slip" style={art.slips[9]!.origin + s9.order} data-on={s9.on} data-peek={s9.peek} data-slot="9" tabindex={s9.tab} role="img" aria-label={s9.path} aria-description={s9.note}>
					<path class="shadow-wash" d={art.slips[9]!.cast} />
					<path class="sheet-paper" d={art.slips[9]!.paper} />
					<path class="wash pink peek-wash" d={art.slips[9]!.wash} />
					<path class="sheet-hatch light" d={art.slips[9]!.fold} />
					<path class="sheet-ink type" d={art.slips[9]!.rules} />
					<path class="sheet-ink" d={art.slips[9]!.ink} />
					<text class="file" transform={art.slips[9]!.nameMatrix}><tspan class="dir">{s9.dir}</tspan>{s9.name}</text>
				</g>
				<g class="slip" style={art.slips[10]!.origin + s10.order} data-on={s10.on} data-peek={s10.peek} data-slot="10" tabindex={s10.tab} role="img" aria-label={s10.path} aria-description={s10.note}>
					<path class="shadow-wash" d={art.slips[10]!.cast} />
					<path class="sheet-paper" d={art.slips[10]!.paper} />
					<path class="wash pink peek-wash" d={art.slips[10]!.wash} />
					<path class="sheet-hatch light" d={art.slips[10]!.fold} />
					<path class="sheet-ink type" d={art.slips[10]!.rules} />
					<path class="sheet-ink" d={art.slips[10]!.ink} />
					<text class="file" transform={art.slips[10]!.nameMatrix}><tspan class="dir">{s10.dir}</tspan>{s10.name}</text>
				</g>
				<g class="slip" style={art.slips[11]!.origin + s11.order} data-on={s11.on} data-peek={s11.peek} data-slot="11" tabindex={s11.tab} role="img" aria-label={s11.path} aria-description={s11.note}>
					<path class="shadow-wash" d={art.slips[11]!.cast} />
					<path class="sheet-paper" d={art.slips[11]!.paper} />
					<path class="wash pink peek-wash" d={art.slips[11]!.wash} />
					<path class="sheet-hatch light" d={art.slips[11]!.fold} />
					<path class="sheet-ink type" d={art.slips[11]!.rules} />
					<path class="sheet-ink" d={art.slips[11]!.ink} />
					<text class="file" transform={art.slips[11]!.nameMatrix}><tspan class="dir">{s11.dir}</tspan>{s11.name}</text>
				</g>
				<g class="slip" style={art.slips[12]!.origin + s12.order} data-on={s12.on} data-peek={s12.peek} data-slot="12" tabindex={s12.tab} role="img" aria-label={s12.path} aria-description={s12.note}>
					<path class="shadow-wash" d={art.slips[12]!.cast} />
					<path class="sheet-paper" d={art.slips[12]!.paper} />
					<path class="wash pink peek-wash" d={art.slips[12]!.wash} />
					<path class="sheet-hatch light" d={art.slips[12]!.fold} />
					<path class="sheet-ink type" d={art.slips[12]!.rules} />
					<path class="sheet-ink" d={art.slips[12]!.ink} />
					<text class="file" transform={art.slips[12]!.nameMatrix}><tspan class="dir">{s12.dir}</tspan>{s12.name}</text>
				</g>
				<g class="slip" style={art.slips[13]!.origin + s13.order} data-on={s13.on} data-peek={s13.peek} data-slot="13" tabindex={s13.tab} role="img" aria-label={s13.path} aria-description={s13.note}>
					<path class="shadow-wash" d={art.slips[13]!.cast} />
					<path class="sheet-paper" d={art.slips[13]!.paper} />
					<path class="wash pink peek-wash" d={art.slips[13]!.wash} />
					<path class="sheet-hatch light" d={art.slips[13]!.fold} />
					<path class="sheet-ink type" d={art.slips[13]!.rules} />
					<path class="sheet-ink" d={art.slips[13]!.ink} />
					<text class="file" transform={art.slips[13]!.nameMatrix}><tspan class="dir">{s13.dir}</tspan>{s13.name}</text>
				</g>
				<g class="slip" style={art.slips[14]!.origin + s14.order} data-on={s14.on} data-peek={s14.peek} data-slot="14" tabindex={s14.tab} role="img" aria-label={s14.path} aria-description={s14.note}>
					<path class="shadow-wash" d={art.slips[14]!.cast} />
					<path class="sheet-paper" d={art.slips[14]!.paper} />
					<path class="wash pink peek-wash" d={art.slips[14]!.wash} />
					<path class="sheet-hatch light" d={art.slips[14]!.fold} />
					<path class="sheet-ink type" d={art.slips[14]!.rules} />
					<path class="sheet-ink" d={art.slips[14]!.ink} />
					<text class="file" transform={art.slips[14]!.nameMatrix}><tspan class="dir">{s14.dir}</tspan>{s14.name}</text>
				</g>
				<g class="slip" style={art.slips[15]!.origin + s15.order} data-on={s15.on} data-peek={s15.peek} data-slot="15" tabindex={s15.tab} role="img" aria-label={s15.path} aria-description={s15.note}>
					<path class="shadow-wash" d={art.slips[15]!.cast} />
					<path class="sheet-paper" d={art.slips[15]!.paper} />
					<path class="wash pink peek-wash" d={art.slips[15]!.wash} />
					<path class="sheet-hatch light" d={art.slips[15]!.fold} />
					<path class="sheet-ink type" d={art.slips[15]!.rules} />
					<path class="sheet-ink" d={art.slips[15]!.ink} />
					<text class="file" transform={art.slips[15]!.nameMatrix}><tspan class="dir">{s15.dir}</tspan>{s15.name}</text>
				</g>

				<text class="peek" data-on={shown.path === '' ? 'no' : 'yes'} aria-hidden="true">
					<tspan class="peek-path" x={art.peek.x} y={art.peek.y}>{shown.path}</tspan>
					<tspan x={art.peek.x} y={art.peek.y2}>{shown.note}</tspan>
				</text>
				<g class="note" aria-hidden="true">
					<path class="halo" d={art.note.arrow} />
					<path class="ink" d={art.note.arrow} />
					<text class="hand">
						<tspan x={art.note.at.x} y={art.note.at.y}>ONE FILE IS</tspan>
						<tspan x={art.note.at.x} y={art.note.at.y2}>YOUR PAGE</tspan>
					</text>
				</g>
			</svg>
		</label>
		<figcaption class="sr">
			A pen-and-ink drawing of a desk. A sheet of paper drawn as a terminal waits at a shell prompt: type npm create markless@latest and
			press Enter, or press Enter on the empty line to take the suggestion. It then asks the real questions one at a time: what you are
			building, the app's name, where it runs, whether to install dependencies and initialize git, and whether to create the app. Arrow keys
			move, Enter picks, typing names the app, Escape starts over. Below lies a closed folder labelled with the app's name. On Create app it
			opens and every file the chosen starter writes drops into it as a sheet of paper; the first page's name is washed yellow. Hover, tap
			or focus a sheet to read what that file is for.
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
			}

			.line-in {
				position: absolute;
				left: 14%;
				top: 2%;
				width: 71%;
				height: 43%;
				padding: 0;
				border: 0;
				font-size: 16px;
				opacity: 0;
				cursor: text;
			}

			.stage[data-typing='none'] .line-in {
				pointer-events: none;
			}

			.row[data-option]:not([data-option='-1']) {
				cursor: pointer;
			}

			.focus,
			.caret {
				visibility: hidden;
			}

			.stage:focus-within .focus[data-on='yes'],
			.stage:has(.line-in:focus) .caret {
				visibility: visible;
			}

			.stage:has(.line-in:not(:focus)) .focus {
				visibility: hidden;
			}

			.row[data-kind='input'] .under {
				display: none;
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

			.slip {
				outline: none;
			}

			.slip[data-on='yes'] {
				cursor: pointer;
			}

			.slip[data-on='no'] {
				pointer-events: none;
			}

			.peek-wash {
				visibility: hidden;
			}

			.slip[data-peek='yes'] .peek-wash {
				visibility: visible;
			}

			.slip[data-peek='yes'] .sheet-paper {
				stroke: var(--sheet-ink);
				stroke-width: 2;
			}

			.peek {
				font-size: 13px;
				fill: var(--ink);
			}

			.peek[data-on='no'] {
				visibility: hidden;
			}

			.peek-path {
				font-family: var(--font-mono);
				font-weight: 700;
				font-size: 12px;
			}

			.cursor,
			.under {
				transform-box: view-box;
				transform: scaleX(var(--w));
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--sheet-ink: var(--ink);
				--kraft: color-mix(in oklch, var(--paper) 72%, oklch(74% 0.07 72));
				--shade: color-mix(in oklch, var(--ink) 24%, transparent);
				--shade-ink: var(--ink);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
					--kraft: color-mix(in oklch, var(--paper) 74%, oklch(48% 0.06 72));
					--shade: rgb(0 0 0 / 0.55);
					--shade-ink: rgb(0 0 0 / 0.85);
				}
			}

			.sheet-paper {
				fill: var(--sheet);
			}

			.kraft {
				fill: var(--kraft);
			}

			.cover-paper {
				fill: color-mix(in oklch, var(--kraft) 88%, var(--ink));
			}

			.kraft-inside {
				fill: color-mix(in oklch, var(--kraft) 60%, var(--paper));
			}

			.sheet-ink {
				fill: var(--sheet-ink);
			}

			.type {
				opacity: 0.5;
			}

			.sheet-hatch {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.6;
				stroke-linecap: round;
				opacity: 0.8;
			}

			.ink {
				fill: var(--ink);
			}

			.halo {
				fill: none;
				stroke: var(--paper);
				stroke-width: 2.6;
				stroke-linejoin: round;
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
			}

			.yellow {
				fill: var(--yellow);
				stroke: var(--yellow);
				opacity: 0.85;
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

			.pink.pool {
				fill: var(--pink);
				opacity: 0.45;
			}

			.hit {
				fill: transparent;
			}

			.term,
			.tab,
			.dir,
			.file {
				font-family: var(--font-mono);
				fill: var(--sheet-ink);
			}

			.term {
				font-size: 13px;
				white-space: pre;
				font-variant-ligatures: none;
			}

			.hint {
				font-size: 10.5px;
				opacity: 0.62;
			}

			.value {
				opacity: 0.72;
			}

			.row[data-kind='start'] .hint {
				font-size: 13px;
				font-weight: 700;
				opacity: 1;
			}

			.row[data-kind='cmd'] .line,
			.row[data-kind='active'] .line,
			.row[data-kind='pick'] .line,
			.row[data-kind='note'] .line {
				font-weight: 700;
			}

			.row[data-kind='value'] .line,
			.row[data-kind='opt'] .line {
				opacity: 0.72;
			}

			.mark {
				opacity: 0.7;
			}

			.tab {
				font-size: 12px;
				font-weight: 700;
				fill: var(--ink);
			}

			.dir {
				font-size: 7.6px;
				font-weight: 500;
				opacity: 0.65;
			}

			.file {
				font-size: 9px;
				font-weight: 700;
			}

			.hand {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 13px;
				letter-spacing: 0.16em;
				text-anchor: end;
				fill: var(--ink);
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

			.scene[data-made='no'] .note,
			.scene[data-made='yes'] .cover,
			.cursor[data-on='no'],
			.slip[data-on='no'] {
				opacity: 0;
			}

			.slip,
			.cover {
				transform-box: view-box;
			}

			.scene[data-beat='odd'] {
				--drop: drop-a;
				--open: open-a;
				--wash-in: wash-in-a;
			}

			.scene[data-beat='even'] {
				--drop: drop-b;
				--open: open-b;
				--wash-in: wash-in-b;
			}

			.scene[data-made='yes'] .cover {
				animation: var(--open) 340ms ease-in both;
			}

			.scene[data-made='yes'] .slip[data-on='yes'] {
				animation: var(--drop) 380ms calc(300ms + var(--i) * 85ms) cubic-bezier(0.45, 0, 0.6, 1) both;
			}

			.scene[data-made='yes'] .page-wash,
			.scene[data-made='yes'] .note {
				animation: var(--wash-in) 500ms calc(700ms + var(--n) * 85ms) ease-out both;
			}

			@keyframes open-a {
				from {
					opacity: 1;
					transform: none;
				}

				to {
					opacity: 1;
					transform: scaleY(0);
				}
			}

			@keyframes open-b {
				from {
					opacity: 1;
					transform: none;
				}

				to {
					opacity: 1;
					transform: scaleY(0);
				}
			}

			@keyframes drop-a {
				from {
					opacity: 0;
					transform: translate(-3px, -22px) rotate(-1.5deg) scale(1.05);
				}

				1% {
					opacity: 1;
				}

				80% {
					transform: translate(0, 1px);
				}

				to {
					opacity: 1;
					transform: none;
				}
			}

			@keyframes drop-b {
				from {
					opacity: 0;
					transform: translate(-3px, -22px) rotate(-1.5deg) scale(1.05);
				}

				1% {
					opacity: 1;
				}

				80% {
					transform: translate(0, 1px);
				}

				to {
					opacity: 1;
					transform: none;
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

			@container anatomy (max-width: 520px) {
				.term {
					font-size: 17px;
				}

				.hint {
					font-size: 11px;
				}

				.row[data-kind='start'] .hint {
					font-size: 17px;
				}

				.peek {
					font-size: 20px;
				}

				.peek-path {
					font-size: 18px;
				}

				.hand {
					font-size: 14px;
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
