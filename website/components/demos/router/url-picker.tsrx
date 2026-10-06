import { state } from '@markless/core';

// Answers are inline ternaries: a computed that reads a plain object is not in the chunk the click runs.
export default function UrlPicker() @{
	let url = state('/blog/hello');

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
		<pre class="file-lines">{'pages/index.tsrx\npages/about.tsrx\npages/blog/[slug].tsrx\npages/docs/[...slug].mdx\npages/404.tsrx'}</pre>
		<div class="playground-controls">
			<button type="button" class="pick" aria-pressed={url === '/' ? 'true' : 'false'} onClick={() => (url = '/')}>
				/
			</button>
			<button type="button" class="pick" aria-pressed={url === '/about/' ? 'true' : 'false'} onClick={() => (url = '/about/')}>
				/about/
			</button>
			<button type="button" class="pick" aria-pressed={url === '/blog/hello' ? 'true' : 'false'} onClick={() => (url = '/blog/hello')}>
				/blog/hello
			</button>
			<button type="button" class="pick" aria-pressed={url === '/docs' ? 'true' : 'false'} onClick={() => (url = '/docs')}>
				/docs
			</button>
			<button type="button" class="pick" aria-pressed={url === '/docs/guide/intro' ? 'true' : 'false'} onClick={() => (url = '/docs/guide/intro')}>
				/docs/guide/intro
			</button>
			<button type="button" class="pick" aria-pressed={url === '/nope' ? 'true' : 'false'} onClick={() => (url = '/nope')}>
				/nope
			</button>
		</div>
		<p class="playground-output">
			{url === '/'
				? 'pages/index.tsrx answers.'
				: url === '/about/'
					? 'pages/about.tsrx answers.'
					: url === '/blog/hello'
						? 'pages/blog/[slug].tsrx answers, with params.slug = "hello".'
						: url === '/docs/guide/intro'
							? 'pages/docs/[...slug].mdx answers, with params.slug = "guide/intro".'
							: 'pages/404.tsrx answers, with status 404.'}
		</p>
		<p class="explorer-note">
			{url === '/'
				? 'A file named index answers for its own folder. Here that folder is the site root.'
				: url === '/about/'
					? 'A slash at the end finds the same page as /about.'
					: url === '/blog/hello'
						? 'Square brackets turn a part of the path into a value the page can read.'
						: url === '/docs'
							? 'The catch-all file needs at least one more part after /docs, so nothing matches.'
							: url === '/docs/guide/intro'
								? 'Three dots catch the rest of the path, and the page gets it as one string.'
								: 'No file matches this address, so the 404 page answers.'}
		</p>
	</section>
}
