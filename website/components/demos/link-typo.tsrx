import { state } from '@markless/core';

// Text bindings rather than a record lookup: see NOTES.md finding 31.
export default function LinkTypo() @{
	let shown = state('good');

	<section class="explorer">
		<div class="playground-controls">
			<button type="button" class="pick" onClick={() => shown = 'good'}>
				The route exists
			</button>
			<button type="button" class="pick" onClick={() => shown = 'typo'}>
				Somebody renamed the folder
			</button>
		</div>
		<pre class="file-lines">
			<span class="file-line">
				{shown === 'good'
					? '<Link href="/blog/[slug]" params={{ slug: post.slug }}>{post.title}</Link>'
					: '<Link href="/blogs/[slug]" params={{ slug: post.slug }}>{post.title}</Link>'}
			</span>
		</pre>
		<p class="playground-output">
			{shown === 'good'
				? 'This one compiles. "/blog/[slug]" is a pattern the router generated from a real file.'
				: 'Type error on href: "/blogs/[slug]" is not assignable to MarklessRouterRoutePattern.'}
		</p>
	</section>
}
