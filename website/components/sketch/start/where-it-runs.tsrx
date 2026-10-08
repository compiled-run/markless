import { state } from '@markless/core';
import { WindowDots } from '../../docs/browser-frame.tsrx';
import PreviewCard, { Choice, Controls, Mono, Stage, Watch } from '../../docs/preview-card.tsrx';
import Code from '../../docs/preview-card/code.tsrx';
import { hostBrowser, hostServer, hostTest } from './code-panes.ts';

export default function WhereItRuns() @{
	let host = state('browser');
	let clicks = state(0);

	<PreviewCard name="where-it-runs" label="One counter in three places">
		<Controls title="Where can this counter run?">
			<Choice
				label="Runs in"
				hint="Each place calls a different function. counter.tsrx stays the same."
				options={['browser', 'server', 'test']}
				value="browser"
				onChange={(next: string) => {
					host = next;
					clicks = 0;
				}}
			/>
		</Controls>
		<Stage>
			<div class="frame" data-host={host}>
				<div class="bar">
					<WindowDots />
					<span class="for-browser">a page at <Mono>my-app.dev</Mono></span>
					<span class="for-server">HTML from <Mono>renderToString()</Mono></span>
					<span class="for-test">a test in <Mono>counter.browser.ts</Mono></span>
				</div>
				<div class="inside">
					<button type="button" class="count" onClick={() => clicks++}>Count {clicks}</button>
				</div>
			</div>
		</Stage>
		<Watch>
			<span class="said" hidden={host !== 'browser'}>
				<Mono>render()</Mono> ran Counter once, in the browser.
			</span>
			<span class="said" hidden={host !== 'server'}>
				<Mono>renderToString()</Mono> ran Counter once, on a server.
			</span>
			<span class="said" hidden={host !== 'test'}>
				<Mono>render()</Mono> from the test package ran Counter once, in the test.
			</span>
			<span class="said">{clicks === 0 ? ' Same file, same button: click it.' : ` Same file, same button: click ${clicks} changed only the number.`}</span>
		</Watch>
		<div class="variant" hidden={host !== 'browser'}>
			<Code files={hostBrowser} />
		</div>
		<div class="variant" hidden={host !== 'server'}>
			<Code files={hostServer} />
		</div>
		<div class="variant" hidden={host !== 'test'}>
			<Code files={hostTest} />
		</div>
		<style>
			.said,
			.said :where(span, b) {
				font-family: var(--pg-font);
			}

			.frame {
				box-sizing: border-box;
				width: min(26rem, 100%);
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
			}

			.bar {
				display: flex;
				align-items: center;
				gap: 0.75em;
				padding: 0.45em 0.8em;
				border-block-end: 1px solid var(--pg-edge);
				border-start-start-radius: inherit;
				border-start-end-radius: inherit;
				background: color-mix(in srgb, var(--ink) var(--hover-wash), var(--paper));
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.bar span {
				display: none;
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.frame[data-host='browser'] .for-browser,
			.frame[data-host='server'] .for-server,
			.frame[data-host='test'] .for-test {
				display: inline;
			}

			.inside {
				display: grid;
				place-items: center;
				padding: 2.25em 1em;
			}

			.count {
				padding: 0.5em 1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step-0);
				cursor: pointer;
				transition: background 140ms ease;
			}

			.count:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.count:active {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.count:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			.variant[hidden] {
				display: none;
			}

			div.variant {
				display: contents;
			}

			@media (prefers-reduced-motion: reduce) {
				.count {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
