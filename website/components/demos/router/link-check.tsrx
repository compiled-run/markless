import { state } from '@markless/core';

// Answers are inline ternaries: a computed that reads a plain object is not in the chunk the click runs.
export default function LinkCheck() @{
	let shown = state('good');

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
		<div class="playground-controls">
			<button type="button" class="pick" aria-pressed={shown === 'good' ? 'true' : 'false'} onClick={() => (shown = 'good')}>
				The link is right
			</button>
			<button type="button" class="pick" aria-pressed={shown === 'renamed' ? 'true' : 'false'} onClick={() => (shown = 'renamed')}>
				The folder was renamed
			</button>
			<button type="button" class="pick" aria-pressed={shown === 'params' ? 'true' : 'false'} onClick={() => (shown = 'params')}>
				The params are missing
			</button>
		</div>
		<pre class="file-lines">{shown === 'good' ? '<Link href="/blog/[slug]" params={{ slug: \'hello\' }}>First post</Link>' : shown === 'renamed' ? '<Link href="/blogs/[slug]" params={{ slug: \'hello\' }}>First post</Link>' : '<Link href="/blog/[slug]">First post</Link>'}</pre>
		<p class="playground-output">
			{shown === 'good'
				? 'The build passes.'
				: 'The build stops.'}
		</p>
		<p class="explorer-note">
			{shown === 'good'
				? 'The page gets a real <a href="/blog/hello">First post</a>.'
				: shown === 'renamed'
					? 'Typed route error: /blogs/[slug] does not match any route in pages/.'
					: 'Typed route error: /blog/[slug] requires params: - slug'}
		</p>
	</section>
}
