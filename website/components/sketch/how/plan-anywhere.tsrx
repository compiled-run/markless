import { state } from '@markless/core';
import PreviewCard, { Choice, Controls, Stage, Watch } from '../../docs/preview-card.tsrx';

export default function PlanAnywhere() @{
	let env = state('Browser');
	let count = state(0);

	<PreviewCard name="plan-anywhere" label="One plan, rendered in four places">
		<Controls title="Where can the counter render?">
			<Choice
				label="Place"
				options={['Browser', 'Server', 'Test', 'Build']}
				value="Browser"
				onChange={(next: string) => {
					env = next;
					count = 0;
				}}
			/>
		</Controls>
		<Stage>
			<div class="board" data-env={env} data-clicked={count > 0 ? 'yes' : 'no'}>
				<div class="plan">
					<p class="cap">The plan, written at build time</p>
					<ul class="rows">
						<li class="row">
							<code class="id">state:count</code>
							<span class="what">the state, starts at 0</span>
							<span class="where">
								{env === 'Browser'
									? 'kept in memory'
									: env === 'Server'
										? 'markless/state script'
										: env === 'Test'
											? 'memory, or the HTML'
											: 'rebuilt in the browser'}
							</span>
						</li>
						<li class="row lit-on-click">
							<code class="id">{'Count {count}'}</code>
							<span class="what">one planned text write</span>
							<span class="where">
								{env === 'Browser'
									? 'kept in memory'
									: env === 'Server'
										? 'markless/view script'
										: env === 'Test'
											? 'memory, or the HTML'
											: 'rebuilt in the browser'}
							</span>
						</li>
						<li class="row lit-on-click">
							<code class="id">symbol:0</code>
							<span class="what">the click code, by ID</span>
							<span class="where">
								{env === 'Browser'
									? 'kept in memory'
									: env === 'Server'
										? 'markless/view script'
										: env === 'Test'
											? 'memory, or the HTML'
											: 'rebuilt in the browser'}
							</span>
						</li>
					</ul>
				</div>

				<svg class="arrow" viewBox="0 0 60 30" aria-hidden="true">
					<path d="M3 16 C 18 11, 34 19, 52 14" />
					<path d="M44 7 L 53 14 L 44 21" />
				</svg>

				<div class="place">
					<div class="env" hidden={env !== 'Browser'}>
						<p class="call"><code>{'render(App, { target })'}</code></p>
						<p class="via">runs the browser module</p>
						<button type="button" class="live" onClick={() => count++}>
							Count {count}
						</button>
						<p class="via">A real counter. Press it.</p>
					</div>
					<div class="env" hidden={env !== 'Server'}>
						<p class="call"><code>renderToString(App)</code></p>
						<p class="via">runs the server module once</p>
						<pre class="html"><code>{'<button>Count 0</button>\n<script type="markless/state">\n<script type="markless/view">'}</code></pre>
					</div>
					<div class="env" hidden={env !== 'Test'}>
						<p class="call"><code>render(Counter)</code></p>
						<p class="via">the browser module, in the test browser</p>
						<p class="call"><code>renderSSR(Counter)</code></p>
						<p class="via">the server module in Node, then the HTML loads in the test browser</p>
					</div>
					<div class="env" hidden={env !== 'Build'}>
						<p class="call"><code>MARKLESS_PRERENDER=1</code></p>
						<p class="via">the server module runs during the build, in the repo's demos</p>
						<pre class="html"><code>{'dist/index.html\n<button>Count 0</button>'}</code></pre>
					</div>
				</div>
			</div>
		</Stage>
		<Watch>
			<span hidden={env !== 'Browser'}>
				{count === 0
					? 'Browser: no server at all. render() builds the DOM once, and the plan stays in memory.'
					: 'Click: symbol:0 ran count++, and the one planned text write set Count ' + count + '.'}
			</span>
			<span hidden={env !== 'Server'}>
				Server: the body ran once there. The plan travels in the HTML as two JSON scripts.
			</span>
			<span hidden={env !== 'Test'}>
				Test: one test file can check both the browser module and the server module.
			</span>
			<span hidden={env !== 'Build'}>
				Build time is a preview: the HTML leaves both records out, and the browser rebuilds them.
			</span>
		</Watch>
		<style>
			.board {
				display: grid;
				grid-template-columns: minmax(0, 1fr) 2.25rem minmax(0, 1fr);
				gap: 0.9em;
				align-items: center;
				width: min(40rem, 100%);
			}

			.cap {
				margin: 0 0 0.5em;
				color: var(--ink);
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-weight: 700;
			}

			.rows {
				display: grid;
				gap: 0.55em;
				margin: 0;
				padding: 0;
				list-style: none;
			}

			.row {
				display: grid;
				grid-template-columns: auto 1fr;
				gap: 0.1em 0.7em;
				align-items: baseline;
				margin: 0;
				padding: 0.55em 0.8em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				transition: background 140ms ease;
			}

			.board[data-env='Browser'][data-clicked='yes'] .lit-on-click {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.id,
			.call code,
			.html code {
				padding: 0;
				background: none;
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: 0.9em;
			}

			.html code {
				font-size: 0.8em;
			}

			.id {
				font-weight: 700;
			}

			.what {
				color: var(--ink);
			}

			.where {
				grid-column: 1 / -1;
				justify-self: start;
				padding: 0 0.35em;
				border-radius: 3px;
				background: var(--mark);
				color: var(--on-mark);
				font-size: var(--step--2);
			}

			.arrow {
				width: 100%;
				height: auto;
				fill: none;
				stroke: var(--ink);
				stroke-width: 2;
				stroke-linecap: round;
				stroke-linejoin: round;
			}

			.place {
				display: grid;
				min-height: 9rem;
				align-content: center;
			}

			.env {
				display: grid;
				gap: 0.35em;
				justify-items: start;
			}

			.env[hidden] {
				display: none;
			}

			.call,
			.via {
				margin: 0;
			}

			.via {
				color: var(--ink);
			}

			.html {
				box-sizing: border-box;
				margin: 0.3em 0 0;
				padding: 0.55em 0.8em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				white-space: pre;
				overflow-x: auto;
				max-width: 100%;
			}

			.live {
				margin: 0.4em 0;
				padding: 0.6em 1.1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step-0);
				cursor: pointer;
				transition: background 140ms ease;
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

			@media (max-width: 640px) {
				.board {
					grid-template-columns: minmax(0, 1fr);
				}

				.arrow {
					width: 2.5rem;
					justify-self: center;
					rotate: 90deg;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.row,
				.live {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
