// The iOS and macOS records are copied from poc/fixtures/proofs/*-native-rendering-target/artifact.json.
import { computed, state } from '@markless/core';
import PreviewCard, { Choice, Controls, Stage, Watch } from '../../docs/preview-card.tsrx';

export default function NativeHostsSketch() @{
	let host = state('Browser');
	let web = state(0);
	let ios = state(0);
	let mac = state(0);
	const presses = computed(() => (host === 'Browser' ? web : host === 'iOS' ? ios : mac));
	const result = computed(() => (host === 'Browser' ? 'text: Count ' : 'title: Count ') + presses);
	const said = computed(() =>
		host === 'Browser'
			? presses === 0
				? "Browser: what Markless ships today. Press the button to run the compiler's click symbol."
				: `Browser: the DOM click ran symbol:0, and the text that reads count changed to Count ${presses}.`
			: presses === 0
				? 'A hand-written proof. Press the drawn button to follow its native event.'
				: `${host === 'iOS' ? 'iOS proof: touchUpInside' : 'macOS proof: action'} ran symbol:counter.increment. Then the Swift runtime read every text binding again.`,
	);

	<PreviewCard name="native-hosts" label="One counter record, three hosts">
		<Controls title="One event record, three hosts">
			<Choice
				label="Host"
				hint="The browser runs the compiler's real output. The iOS and macOS proofs read a hand-written artifact.json."
				options={['Browser', 'iOS', 'macOS']}
				value="Browser"
				onChange={(next: string) => (host = next)}
			/>
		</Controls>
		<Stage>
			<div class="board" data-host={host} data-pressed={presses > 0 ? 'yes' : 'no'}>
				<div class="record">
					<p class="cap">{host === 'Browser' ? 'markless/view event record' : 'artifact.json event record'}</p>
					<pre class="json" hidden={host !== 'Browser'}><code>{'{\n  "hostNodeId": "h0",\n  "eventName": '}<mark>"click"</mark>{',\n  "symbolIds": ["symbol:0"]\n}'}</code></pre>
					<pre class="json" hidden={host === 'Browser'}><code>{'{\n  "node": "host:button",\n  "authoredEvent": "onClick",\n  "semanticEvent": "activate",\n  "nativeEvent": '}<mark>{host === 'macOS' ? '"action"' : '"touchUpInside"'}</mark>{',\n  "symbolId": "symbol:counter.increment"\n}'}</code></pre>
					<p class="note">{host === 'Browser' ? 'Written by the compiler.' : 'Written by hand. No Markless package writes it yet.'}</p>
				</div>

				<div class="host">
					<div class="device web" hidden={host !== 'Browser'}>
						<p class="bar" aria-hidden="true"><span></span><span></span><span></span></p>
						<button type="button" class="live" onClick={() => web++}>Count {web}</button>
						<p class="kind">a DOM <code>{'<button>'}</code></p>
					</div>
					<div class="device phone" hidden={host !== 'iOS'}>
						<span class="notch" aria-hidden="true"></span>
						<p class="heading">Markless iOS Proof</p>
						<button type="button" class="live" aria-label={'Drawn UIButton: Count ' + ios} onClick={() => ios++}>Count {ios}</button>
						<p class="kind"><code>UIButton</code>, drawn here</p>
					</div>
					<div class="device mac" hidden={host !== 'macOS'}>
						<p class="bar" aria-hidden="true"><span></span><span></span><span></span></p>
						<p class="heading">Markless macOS Proof</p>
						<button type="button" class="live" aria-label={'Drawn NSButton: Count ' + mac} onClick={() => mac++}>Count {mac}</button>
						<p class="kind"><code>NSButton</code>, drawn here</p>
					</div>

					<ol class="trace">
						<li><code>{host === 'Browser' ? 'click' : host === 'iOS' ? 'touchUpInside' : 'action'}</code></li>
						<li>{host === 'Browser' ? 'symbol:0 runs' : 'symbol runs in JavaScriptCore'}</li>
						<li>{result}</li>
					</ol>
				</div>
			</div>
		</Stage>
		<Watch>
			<span>{said}</span>
		</Watch>
		<style>
			.board {
				display: grid;
				grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
				gap: 1.4em;
				align-items: center;
				width: min(40rem, 100%);
			}

			.cap {
				margin: 0 0 0.45em;
				color: var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-weight: 700;
			}

			.json {
				margin: 0;
				padding: 0.7em 0.85em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				overflow-x: auto;
			}

			.json[hidden],
			.device[hidden] {
				display: none;
			}

			.json code,
			.json mark,
			.kind code,
			.trace code {
				padding: 0;
				background: none;
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: 0.8em;
				line-height: 1.6;
			}

			.json mark {
				padding: 0 0.15em;
				border-radius: 3px;
				background: var(--mark);
				color: var(--on-mark);
				font-size: 1em;
				font-weight: 700;
			}

			.note {
				margin: 0.45em 0 0;
				color: var(--ink);
				font-size: var(--step--2);
			}

			.host {
				display: grid;
				justify-items: center;
				gap: 0.9em;
			}

			.device {
				display: grid;
				justify-items: center;
				gap: 0.5em;
				box-sizing: border-box;
				border: 1.5px solid var(--ink);
				background: var(--paper);
			}

			.web,
			.mac {
				width: 13rem;
				padding: 0 0.9em 0.8em;
				border-radius: 8px;
			}

			.phone {
				width: 11rem;
				min-height: 13rem;
				align-content: center;
				padding: 1.6em 0.8em 1.2em;
				border-radius: 22px;
				position: relative;
			}

			.notch {
				position: absolute;
				inset-block-start: 0.5em;
				inset-inline-start: 50%;
				width: 3em;
				height: 0.55em;
				border: 1px solid var(--ink);
				border-radius: 999px;
				translate: -50% 0;
			}

			.bar {
				display: flex;
				gap: 0.3em;
				justify-self: stretch;
				margin: 0 -0.9em;
				padding: 0.4em 0.6em;
				border-block-end: 1px solid var(--ink);
			}

			.bar span {
				width: 0.55em;
				height: 0.55em;
				border: 1px solid var(--ink);
				border-radius: 999px;
			}

			.heading {
				margin: 0;
				color: var(--ink);
				font-weight: 700;
				text-align: center;
			}

			.kind {
				margin: 0;
				color: var(--ink);
				font-size: var(--step--2);
			}

			.live {
				padding: 0.45em 1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step-0);
				cursor: pointer;
				transition: background 140ms ease;
			}

			.phone .live {
				border-radius: 999px;
			}

			.web .live {
				margin-block-start: 0.4em;
			}

			.live:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.live:active {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.live:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			.trace {
				display: grid;
				justify-items: center;
				gap: 1.3em;
				margin: 0;
				padding: 0;
				list-style: none;
			}

			.trace li {
				position: relative;
				padding: 0.1em 0.5em;
				border: 1px dashed var(--ink);
				border-radius: 6px;
				color: var(--ink);
				font-size: var(--step--2);
				transition: background 140ms ease;
			}

			.trace li + li::before {
				position: absolute;
				inset-block-end: 100%;
				inset-inline-start: 50%;
				translate: -50% 0;
				line-height: 1.3;
				content: '↓';
			}

			.board[data-pressed='yes'] .trace li {
				border-style: solid;
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			@media (max-width: 640px) {
				.board {
					grid-template-columns: minmax(0, 1fr);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.live,
				.trace li {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
