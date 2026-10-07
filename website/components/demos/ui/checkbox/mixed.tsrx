import { state } from '@markless/core';
import { checkbox } from '@markless/ui';

export default function CheckboxMixed() @{
	let tea = state(true);
	let cake = state(false);

	<div class="list">
		<checkbox.root
			class="row all"
			checked={tea && cake ? true : tea || cake ? 'mixed' : false}
			onChange={(next) => {
				tea = next === true;
				cake = next === true;
			}}
		>
			<checkbox.trigger class="box">
				<checkbox.indicator class="tick">✓</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label class="label">Order both</checkbox.label>
		</checkbox.root>
		<checkbox.root
			class="row"
			checked={tea}
			onChange={(next) => {
				tea = next === true;
			}}
		>
			<checkbox.trigger class="box">
				<checkbox.indicator class="tick">✓</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label class="label">Tea</checkbox.label>
		</checkbox.root>
		<checkbox.root
			class="row"
			checked={cake}
			onChange={(next) => {
				cake = next === true;
			}}
		>
			<checkbox.trigger class="box">
				<checkbox.indicator class="tick">✓</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label class="label">Cake</checkbox.label>
		</checkbox.root>

		<style>
			.list {
				display: grid;
				gap: 0.6em;
				width: min(16rem, 100%);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.5;
				color: var(--ink);
			}

			.row {
				display: flex;
				gap: 0.75em;
				align-items: center;
				margin-inline-start: 2.35em;
			}

			.all {
				margin-inline-start: 0;
				padding-block-end: 0.6em;
				border-block-end: 1px solid var(--ink);
			}

			.box {
				display: grid;
				place-items: center;
				box-sizing: border-box;
				width: 1.75em;
				height: 1.75em;
				padding: 0;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				cursor: pointer;
				transition: background 140ms ease;
			}

			.box:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.box[ui-checked],
			.box[ui-mixed] {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.box:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 4px;
			}

			.tick {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 1.15em;
				line-height: 1;
			}

			.box[ui-mixed] .tick {
				display: none;
			}

			.box[ui-mixed]::after {
				content: '–';
				font-family: 'Shantell Sans', system-ui, sans-serif;
				line-height: 1;
			}

			.label {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				cursor: pointer;
			}

			@media (prefers-reduced-motion: reduce) {
				.box {
					transition: none;
				}
			}
		</style>
	</div>;
}
