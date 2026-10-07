// Pass names, inputs and outputs come from the compiler's own registry; excerpts are copied from compileTsrxModule() output.
import { computed, state } from '@markless/core';
import { defaultCompilerPasses } from '../../../../packages/compiler/src/pass-registry.ts';
import PreviewCard, { Action, Controls, Stage, Watch } from '../../docs/preview-card.tsrx';

const PASSES = defaultCompilerPasses;

const NOTES: Record<string, { readonly does: string; readonly out: string; readonly marks: string }> = {
	'tsrx-semantic-graph': {
		does: 'Builds the semantic graph from the source.',
		out: 'state:count   state, scalar, starts at 0\nh0            <button>\nevent:0       click on h0\n              runs "() => count++"',
		marks: 'state button click',
	},
	'state-lowering': {
		does: 'Turns state reads and writes into graph reads and writes.',
		out: 'read   count    → state:count\nwrite  count++  → state:count\n       operation "update", operator "++"',
		marks: 'click text',
	},
	'payload-arena': {
		does: 'Plans the state and view records.',
		out: 'cell     state:count, scalar\nlocator  h0, dom-order, index 0\nupdate   text of h0, prefix "Count "',
		marks: 'state button',
	},
	'symbol-resolver': {
		does: 'Plans the symbols.',
		out: 'symbol:0  event-handler, click on h0\nsymbol:1  dom-update, text of h0',
		marks: 'click text',
	},
	'render-data': {
		does: 'Splits the markup into static HTML and dynamic slots.',
		out: 'statics  "<button>Count <!--markless-slot:0-->"\n         "</button>"\nslot 0   text, reads state:count',
		marks: 'button text',
	},
	'public-render-plan': {
		does: 'Collects scoped styles and flags markup the render modules cannot emit.',
		out: 'styleScopes  []\ndiagnostics  []',
		marks: '',
	},
	'capture-analysis': {
		does: 'Checks what each symbol reads.',
		out: 'symbol:0  captures count\n          → graph reference state:count\nsymbol:1  captures nothing',
		marks: 'click',
	},
	'protocol-state': {
		does: 'Writes the state record.',
		out: '{"graphNodeId":"state:count",\n "name":"count","valueKind":"scalar",\n "value":{"version":1,"root":0,"records":[]}}',
		marks: 'state',
	},
	'protocol-view': {
		does: 'Writes the view record, with symbol IDs on each entry.',
		out: 'events      h0 click → ["symbol:0"]\ndomUpdates  state:count → text of h0\n            → "symbol:1"',
		marks: 'button click text',
	},
	'public-render-module': {
		does: 'Writes the browser and server render modules, and picks the direct module when it can.',
		out: 'export function Counter() { … }\n  ↑ the browser module\nasync function marklessRenderSsr(props = {}, …)\n  ↑ the server module',
		marks: 'state',
	},
	'payload-scripts': {
		does: 'Writes the markless/state and markless/view script tags.',
		out: '<script type="markless/state">…</script>\n<script type="markless/view">…</script>',
		marks: '',
	},
	'symbol-modules': {
		does: 'Writes one module source per symbol.',
		out: 'export function symbol_0(context) { … }\nexport function symbol_1(context) { … }',
		marks: 'click text',
	},
	'runtime-demand-map': {
		does: 'Maps each symbol and record to the runtime code it needs.',
		out: 'symbol:0  needs web/fns/write-scalar\nsymbol:1  needs nothing extra',
		marks: 'click text',
	},
	'trigger-groups': {
		does: 'Groups each event with the state, records and symbols it touches.',
		out: 'h0:click  → state:count\n          → symbol:0, symbol:1',
		marks: 'click',
	},
	'symbol-resolver-module': {
		does: 'Writes the module that imports symbols by ID.',
		out: 'export async function loadSymbol(id) { … }',
		marks: '',
	},
};

export default function CompilerPasses() @{
	let step = state(1);
	const passId = computed(() => PASSES[step - 1].passId);
	const does = computed(() => NOTES[PASSES[step - 1].passId].does);
	const out = computed(() => NOTES[PASSES[step - 1].passId].out);
	const marks = computed(() => NOTES[PASSES[step - 1].passId].marks);
	const reads = computed(() => [...PASSES[step - 1].consumes]);
	const writes = computed(() => [...PASSES[step - 1].produces]);
	const watch = computed(() => {
		const pass = PASSES[step - 1];
		const made = `New: ${pass.produces.join(' and ')}.`;
		const readers = PASSES.slice(step).filter((later) => later.consumes.some((name) => pass.produces.includes(name))).length;
		if (step === PASSES.length) return `${made} That is the last pass.`;
		return `${made} ${readers === 0 ? 'No later pass reads it.' : readers === 1 ? 'One later pass reads it.' : `${readers} later passes read it.`}`;
	});
	const where = computed(() => `Pass ${step} of ${PASSES.length}`);
	const track = computed(() => `--done:${step - 1};--total:${PASSES.length}`);
	const atEnd = computed(() => step === PASSES.length);

	<PreviewCard name="compiler-passes" label="The compiler passes, one at a time">
		<Controls title="What does each pass add?">
			<div class="stepper">
				<Action disabled={step === 1} onClick={() => (step = step > 1 ? step - 1 : 1)}>← Back</Action>
				<p class="where" aria-live="polite">{where}</p>
				<Action disabled={atEnd} onClick={() => (step = step < PASSES.length ? step + 1 : PASSES.length)}>Next →</Action>
			</div>
			<span class="track" aria-hidden="true" style={track}></span>
		</Controls>
		<Stage>
			<div class="board" data-marks={marks}>
				<div class="source">
					<p class="file">Counter.tsrx</p>
					<pre class="code"><code><span class="line"><b>export function</b> Counter() <b>{'@{'}</b></span><span class="line">{'  let '}<span class="m state">{'count = state(0)'}</span>{';'}</span><span class="line">{'  '}<span class="m button">{'<button'}</span>{' '}<span class="m click">{'onClick={() => count++}'}</span>{'>'}</span><span class="line">{'    '}<span class="m text">{'Count {count}'}</span></span><span class="line">{'  </button>'}</span><span class="line"><b>{'}'}</b></span></code></pre>
				</div>
				<div class="pass">
					<p class="name"><code>{passId}</code></p>
					<p class="does">{does}</p>
					<div class="io">
						<span class="io-name">Reads</span>
						<ul class="chips">
							@for (const name of reads; key name) {
								<li class="chip read">{name}</li>
							}
						</ul>
						<span class="io-name">Writes</span>
						<ul class="chips">
							@for (const name of writes; key name) {
								<li class="chip new">{name}</li>
							}
						</ul>
					</div>
					<pre class="out"><code>{out}</code></pre>
				</div>
			</div>
		</Stage>
		<Watch>
			<span>{watch}</span>
		</Watch>
		<style>
			.stepper {
				display: flex;
				gap: 0.5em;
				align-items: center;
				margin-inline-start: auto;
			}

			.where {
				margin: 0;
				min-width: 6.5em;
				color: var(--ink);
				text-align: center;
			}

			.board {
				display: grid;
				grid-template-columns: max-content minmax(0, 1fr);
				gap: 1.1em 1.4em;
				width: min(42rem, 100%);
			}

			.source,
			.pass {
				min-width: 0;
			}

			.file,
			.cap {
				margin: 0 0 0.4em;
				color: var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-weight: 700;
			}

			.code,
			.out {
				margin: 0;
				padding: 0.7em 0.85em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				overflow-x: auto;
			}

			.code code,
			.out code,
			.name code,
			.chip {
				padding: 0;
				background: none;
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: 0.85em;
				line-height: 1.6;
			}

			.code code *,
			.out code * {
				font-family: var(--font-mono);
			}

			.line {
				display: block;
				white-space: pre;
			}

			.m {
				border-radius: 3px;
				transition: background 140ms ease;
			}

			.board[data-marks~='state'] .m.state,
			.board[data-marks~='button'] .m.button,
			.board[data-marks~='click'] .m.click,
			.board[data-marks~='text'] .m.text {
				background: var(--mark);
				color: var(--on-mark);
			}

			.name {
				margin: 0;
			}

			.name code {
				font-size: var(--step-0);
				font-weight: 700;
			}

			.does {
				margin: 0.2em 0 0.6em;
				color: var(--ink);
			}

			.out code {
				white-space: pre;
			}

			.io {
				display: grid;
				grid-template-columns: auto minmax(0, 1fr);
				gap: 0.55em 0.8em;
				align-items: start;
				margin-block-end: 0.75em;
			}

			.io-name {
				padding-block-start: 0.1em;
				color: var(--ink);
			}

			.chips {
				display: flex;
				flex-wrap: wrap;
				gap: 0.35em;
				margin: 0;
				padding: 0;
				list-style: none;
			}

			.chip {
				padding: 0.1em 0.45em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				font-size: var(--step--2);
			}

			.chip.read {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.chip.new {
				background: var(--mark);
				color: var(--on-mark);
				font-weight: 700;
			}

			.track {
				flex: 1 0 100%;
				height: 6px;
				border: 1px solid var(--ink);
				border-radius: 999px;
				background:
					linear-gradient(var(--ink), var(--ink)) 0 0 / calc(100% * var(--done) / var(--total)) 100% no-repeat,
					linear-gradient(color-mix(in srgb, var(--purple) 55%, var(--paper)), color-mix(in srgb, var(--purple) 55%, var(--paper))) calc(100% * var(--done) / (var(--total) - 1)) 0 / calc(100% / var(--total)) 100% no-repeat,
					var(--paper);
			}

			@media (max-width: 640px) {
				.board {
					grid-template-columns: minmax(0, 1fr);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.m {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
