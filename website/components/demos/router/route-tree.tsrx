import { state } from '@markless/core';

// The answers are written inline as text bindings rather than looked up from a
// record, because a computed that reads a plain object is not in the chunk the
// click loads: `urls is not defined` (NOTES.md finding 31).
export default function RouteTree() @{
	let picked = state('index');

	<section class="explorer">
		<div class="playground-controls">
			<button type="button" class="pick" onClick={() => picked = 'index'}>
				pages/index.tsrx
			</button>
			<button type="button" class="pick" onClick={() => picked = 'about'}>
				pages/about.tsrx
			</button>
			<button type="button" class="pick" onClick={() => picked = 'slug'}>
				pages/blog/[slug].tsrx
			</button>
			<button type="button" class="pick" onClick={() => picked = 'docs'}>
				pages/docs/[...slug].mdx
			</button>
			<button type="button" class="pick" onClick={() => picked = 'missing'}>
				pages/404.tsrx
			</button>
		</div>
		<p class="playground-output">
			{picked === 'index'
				? '/'
				: picked === 'about'
					? '/about'
					: picked === 'slug'
						? '/blog/:slug'
						: picked === 'docs'
							? '/docs/**'
							: 'every request that matched no other file, answered with status 404'}
		</p>
		<p class="explorer-note">
			{picked === 'index'
				? 'A file called index is the folder itself, so this one is the site root.'
				: picked === 'about'
					? 'The file name is the path. Rename the file and the URL moves with it.'
					: picked === 'slug'
						? 'Square brackets make a segment a parameter, and the page reads it from params.'
						: picked === 'docs'
							? 'Three dots make it a catch-all, so it answers every path underneath /docs.'
							: 'Two files that map to the same URL is a hard error, and the message names both files.'}
		</p>
	</section>
}
