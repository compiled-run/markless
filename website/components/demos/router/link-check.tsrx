import { state } from '@markless/core';
import PreviewCard, { Choice, Controls, Stage, Watch } from '../../docs/preview-card.tsrx';

// Answers are inline ternaries: a computed that reads a plain object is not in the chunk the click runs.
export default function LinkCheck() @{
	let shown = state('right');

	<PreviewCard name="link-check" label="The build checks a typed link">
		<Controls title="Does it build?">
			<Choice
				label="Link"
				hint="What happened to the link before the build ran."
				options={['right', 'renamed', 'no params']}
				value="right"
				onChange={(next: string) => (shown = next)}
			/>
		</Controls>
		<Stage>
			<div class="board" data-shown={shown}>
				<div class="box wide">
					<div class="head">Home.tsrx</div>
					<div class="code">
						{'<Link href="'}<span class="pattern">{shown === 'renamed' ? '/blogs/[slug]' : '/blog/[slug]'}</span>{'"'}<span class="params">{" params={{ slug: 'hello' }}"}</span>{'>First post</Link>'}
					</div>
				</div>
				<div class="box">
					<div class="head">pages/</div>
					<ul class="files">
						<li class="file">index.tsrx</li>
						<li class="file route">blog/[slug].tsrx</li>
					</ul>
				</div>
				<div class="box result">
					<div class="head">{shown === 'right' ? 'The build passes' : 'The build stops'}</div>
					<div class="code">
						{shown === 'right'
							? '<a href="/blog/hello">First post</a>'
							: shown === 'renamed'
								? 'Typed route error: /blogs/[slug] does not match any route in pages/.'
								: 'Typed route error: /blog/[slug] requires params: - slug'}
					</div>
				</div>
			</div>
		</Stage>
		<Watch>
			<span class="said">
				{shown === 'right'
					? 'The pattern matches blog/[slug].tsrx, and slug is given. The page gets a plain <a href>.'
					: shown === 'renamed'
						? 'No file in pages/ matches /blogs/[slug]. The bad link never ships.'
						: 'The route needs slug, and the link gives none. The bad link never ships.'}
			</span>
		</Watch>
		<style>
			.said,
			.said :where(span, b) {
				font-family: var(--pg-font);
			}

			.board {
				display: grid;
				grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr);
				gap: 1em 1.25em;
				align-items: start;
				width: min(34rem, 100%);
			}

			.box {
				box-sizing: border-box;
				min-width: 0;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				overflow: hidden;
			}

			.wide {
				grid-column: 1 / -1;
			}

			.head {
				padding: 0.35em 0.85em;
				border-block-end: 1px solid var(--pg-edge);
				font-family: var(--font-mono);
				font-size: 0.85em;
			}

			.result .head {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: inherit;
			}

			.code {
				padding: 0.6em 0.85em;
				font-family: var(--font-mono);
				font-size: 0.85em;
				line-height: 1.6;
				overflow-wrap: anywhere;
			}

			.code span {
				font-family: var(--font-mono);
			}

			.pattern {
				padding: 0 0.1em;
				border-radius: 3px;
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.board[data-shown='renamed'] .pattern {
				background: color-mix(in srgb, var(--pink) 22%, var(--paper));
			}

			.board[data-shown='no params'] .params {
				display: none;
			}

			.files {
				display: grid;
				margin: 0;
				padding: 0.35em 0;
				list-style: none;
			}

			.file {
				margin: 0;
				padding: 0.3em 0.85em;
				font-family: var(--font-mono);
				font-size: 0.85em;
				line-height: 1.5;
			}

			.board:is([data-shown='right'], [data-shown='no params']) .route {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.board:not([data-shown='right']) .result {
				background: color-mix(in srgb, var(--pink) 18%, var(--paper));
			}

			@media (max-width: 40rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
				}
			}
		</style>
	</PreviewCard>
}
