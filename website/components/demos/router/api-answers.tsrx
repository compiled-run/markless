import { state } from '@markless/core';
import PreviewCard, { Choice, Controls, Stage, Watch } from '../../docs/preview-card.tsrx';

// Answers are inline ternaries: a computed that reads a plain object is not in the chunk the click runs.
export default function ApiAnswers() @{
	let method = state('GET');
	let path = state('/api/users/42');

	<PreviewCard name="api-answers" label="Which file in api/ answers a request">
		<Controls>
			<Choice
				label="Method"
				options={['GET', 'POST']}
				value="GET"
				onChange={(next: string) => (method = next)}
			/>
			<Choice
				label="Path"
				options={['/api/health', '/api/users/42', '/api/nope']}
				value="/api/users/42"
				onChange={(next: string) => (path = next)}
			/>
		</Controls>
		<Stage>
			<div
				class="board"
				data-file={path === '/api/health' ? 'health' : path === '/api/users/42' && method === 'GET' ? 'user' : 'none'}
			>
				<div class="box">
					<div class="head">Request</div>
					<div class="body">{method} {path}</div>
				</div>
				<span class="arrow" aria-hidden="true">→</span>
				<div class="box">
					<div class="head">api/</div>
					<ul class="files">
						<li class="file health">health.ts</li>
						<li class="file user">users/[id].get.ts</li>
					</ul>
				</div>
				<span class="arrow" aria-hidden="true">→</span>
				<div class="box reply">
					<div class="head">Response</div>
					<div class="body">
						{path === '/api/health'
							? '200 ok'
							: path === '/api/users/42' && method === 'GET'
								? '200 {"id":"42"}'
								: '404 Not found'}
					</div>
				</div>
			</div>
		</Stage>
		<Watch>
			<span class="said">
				{path === '/api/health'
					? 'health.ts has no method in its name, so it answers every method.'
					: path === '/api/nope'
						? 'No file in api/ matches this address.'
						: method === 'GET'
							? 'users/[id].get.ts answers. The file name says get, and params.id is "42".'
							: 'The file name says get, so a POST finds no endpoint.'}
			</span>
		</Watch>
		<style>
			.said,
			.said :where(span, b) {
				font-family: var(--pg-font);
			}

			.board {
				display: grid;
				grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr);
				gap: 0.6em;
				align-items: center;
				width: 100%;
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

			.head {
				padding: 0.35em 0.85em;
				border-block-end: 1px solid var(--pg-edge);
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.body {
				padding: 0.6em 0.85em;
				font-family: var(--font-mono);
				font-size: 0.85em;
				line-height: 1.5;
				overflow-wrap: anywhere;
			}

			.board[data-file='none'] .reply .body {
				background: color-mix(in srgb, var(--pink) 18%, var(--paper));
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
				overflow-wrap: anywhere;
				transition: background 140ms ease;
			}

			.board[data-file='health'] .health,
			.board[data-file='user'] .user {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.arrow {
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step-0);
			}

			@media (max-width: 40rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
					justify-items: stretch;
				}

				.arrow {
					justify-self: center;
					rotate: 90deg;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.file {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
