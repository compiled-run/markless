import { state } from '@markless/core';

// Answers are inline ternaries: a computed that reads a plain object is not in the chunk the click runs.
export default function ApiAnswers() @{
	let method = state('GET');
	let path = state('/api/users/42');

	<section class="explorer">
		<style>
			.pick {
				color: var(--ink);
			}

			.pick[aria-pressed='true'] {
				background: var(--yellow);
				color: var(--on-accent);
			}
		</style>
		<pre class="file-lines">{'api/health.ts\napi/users/[id].get.ts'}</pre>
		<div class="playground-controls">
			<button type="button" class="pick" aria-pressed={method === 'GET' ? 'true' : 'false'} onClick={() => (method = 'GET')}>
				GET
			</button>
			<button type="button" class="pick" aria-pressed={method === 'POST' ? 'true' : 'false'} onClick={() => (method = 'POST')}>
				POST
			</button>
		</div>
		<div class="playground-controls">
			<button type="button" class="pick" aria-pressed={path === '/api/health' ? 'true' : 'false'} onClick={() => (path = '/api/health')}>
				/api/health
			</button>
			<button type="button" class="pick" aria-pressed={path === '/api/users/42' ? 'true' : 'false'} onClick={() => (path = '/api/users/42')}>
				/api/users/42
			</button>
			<button type="button" class="pick" aria-pressed={path === '/api/nope' ? 'true' : 'false'} onClick={() => (path = '/api/nope')}>
				/api/nope
			</button>
		</div>
		<p class="playground-output">
			{method} {path}
		</p>
		<p class="explorer-note">
			{path === '/api/health'
				? '200 ok. api/health.ts has no method in its name, so it answers every method.'
				: path === '/api/nope'
					? '404 Not found. No file in api/ matches this address.'
					: method === 'GET'
						? '200 {"id":"42"}. The file name says get, and params.id is "42".'
						: '404 Not found. The file name says get, so a POST finds no endpoint.'}
		</p>
	</section>
}
