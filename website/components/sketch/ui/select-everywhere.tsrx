// One real select in a drawn frame; the frame names where it would run, the select does not change.
import { state } from '@markless/core';
import { select } from '@markless/ui';
import PreviewCard, { Choice, Controls, Mono, Stage, Watch } from '../../docs/preview-card.tsrx';

export default function SelectEverywhere() @{
	let host = state('browser');
	let theme = state('ink');

	<PreviewCard name="select-everywhere" label="The same select wherever it runs">
		<Controls title="Is it the same select?">
			<Choice
				label="Made by"
				hint="This page runs one select. The frame shows where else the same code would run."
				options={['browser', 'server', 'test']}
				value="browser"
				onChange={(next: string) => (host = next)}
			/>
		</Controls>
		<Stage>
			<div class="frame" data-host={host}>
				<div class="bar">
					<span class="for-browser"><Mono>render()</Mono> in the browser alone</span>
					<span class="for-server">HTML from a server, then the browser</span>
					<span class="for-test">a Vitest browser test</span>
				</div>
				<div class="inside">
					<select.root class="picker" value="ink" onChange={(next: string) => (theme = next)}>
						<select.label class="label">Theme</select.label>
						<select.trigger class="trigger"><span>{theme === 'paper' ? 'Paper' : 'Ink'}</span></select.trigger>
						<select.content class="list">
							<select.item class="option" value="paper"><select.itemlabel>Paper</select.itemlabel></select.item>
							<select.item class="option" value="ink"><select.itemlabel>Ink</select.itemlabel></select.item>
						</select.content>
					</select.root>
				</div>
			</div>
		</Stage>
		<Watch>
			<span class="said">
				Same <Mono>select.root</Mono>, same parts, same <Mono>ui-open</Mono>.{' '}
				{host === 'browser'
					? 'render() built it in the browser.'
					: host === 'server'
						? 'A server wrote its HTML first, and the browser picked it up.'
						: 'The package tests run each family both ways, in Vitest.'}
			</span>
		</Watch>
		<style>
			.said,
			.said :where(span, b) {
				font-family: var(--pg-font);
			}

			.frame {
				box-sizing: border-box;
				width: min(24rem, 100%);
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
			}

			.bar {
				padding: 0.45em 0.9em;
				border-block-end: 1px solid var(--pg-edge);
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
				padding: 1.5em 1em 1.75em;
			}

			.picker {
				display: grid;
				gap: 0.5em;
				width: min(14rem, 100%);
			}

			.label {
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.trigger {
				display: flex;
				justify-content: space-between;
				align-items: center;
				padding: 0.45em 0.8em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step-0);
				text-align: start;
				cursor: pointer;
				transition: background 140ms ease;
			}

			.trigger span {
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.trigger::after {
				content: '⌄' / '';
				margin-block-start: -0.35em;
				opacity: 0.65;
			}

			.trigger:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.trigger[ui-open] {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.trigger:focus-visible,
			.option:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			.list:not([hidden]) {
				display: grid;
				padding: 0.25em 0;
				border: 1px solid var(--pg-edge);
				border-radius: 6px;
				background: var(--paper);
				box-shadow: 3px 3px 0 var(--pg-accent);
			}

			.option {
				padding: 0.35em 0.8em;
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				cursor: pointer;
			}

			.option:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.option[ui-selected] {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.option * {
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			@media (prefers-reduced-motion: reduce) {
				.trigger {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
