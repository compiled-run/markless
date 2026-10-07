import { state } from '@markless/core';
import PreviewCard, { Controls, Mono, Stage, Watch } from '../../docs/preview-card.tsrx';

// Answers are inline ternaries: a computed that reads a plain object is not in the chunk the click runs.
export default function UrlPicker() @{
	let url = state('/blog/hello');

	<PreviewCard name="url-picker" label="Which file in pages/ answers an address">
		<Controls title="Which file answers?" />
		<Stage>
			<div
				class="board"
				data-file={url === '/'
					? 'index'
					: url === '/about/'
						? 'about'
						: url === '/blog/hello'
							? 'slug'
							: url === '/docs/guide/intro'
								? 'rest'
								: 'missing'}
			>
				<div class="box">
					<div class="head">Address</div>
					<div class="rows" role="group" aria-label="Addresses">
						<button type="button" class="row" aria-pressed={url === '/' ? 'true' : 'false'} onClick={() => (url = '/')}>/</button>
						<button type="button" class="row" aria-pressed={url === '/about/' ? 'true' : 'false'} onClick={() => (url = '/about/')}>/about/</button>
						<button type="button" class="row" aria-pressed={url === '/blog/hello' ? 'true' : 'false'} onClick={() => (url = '/blog/hello')}>/blog/hello</button>
						<button type="button" class="row" aria-pressed={url === '/docs' ? 'true' : 'false'} onClick={() => (url = '/docs')}>/docs</button>
						<button type="button" class="row" aria-pressed={url === '/docs/guide/intro' ? 'true' : 'false'} onClick={() => (url = '/docs/guide/intro')}>/docs/guide/intro</button>
						<button type="button" class="row" aria-pressed={url === '/nope' ? 'true' : 'false'} onClick={() => (url = '/nope')}>/nope</button>
					</div>
				</div>
				<div class="box">
					<div class="head">pages/</div>
					<ul class="files">
						<li class="file index">index.tsrx</li>
						<li class="file about">about.tsrx</li>
						<li class="file slug">blog/[slug].tsrx<span class="param">slug = "hello"</span></li>
						<li class="file rest">docs/[...slug].mdx<span class="param">slug = "guide/intro"</span></li>
						<li class="file missing">404.tsrx<span class="param">status 404</span></li>
					</ul>
				</div>
			</div>
		</Stage>
		<Watch>
			<span class="said">
				<span class="answer">
					<Mono>
						<span>
							{url === '/'
								? 'pages/index.tsrx'
								: url === '/about/'
									? 'pages/about.tsrx'
									: url === '/blog/hello'
										? 'pages/blog/[slug].tsrx'
										: url === '/docs/guide/intro'
											? 'pages/docs/[...slug].mdx'
											: 'pages/404.tsrx'}
						</span>
					</Mono>
					{' answers. '}
				</span>
				<span class="note">
					{url === '/'
						? 'A file named index answers for its own folder. Here that folder is the site root.'
						: url === '/about/'
							? 'A slash at the end finds the same page as /about.'
							: url === '/blog/hello'
								? 'Square brackets turn a part of the path into a value the page reads as params.slug.'
								: url === '/docs'
									? 'The catch-all file needs at least one more part after /docs, so nothing matches.'
									: url === '/docs/guide/intro'
										? 'Three dots catch the rest of the path, and the page gets it as one string.'
										: 'No file matches this address, so the 404 page answers.'}
				</span>
			</span>
		</Watch>
		<style>
			.said code span {
				font-family: var(--font-mono);
			}

			.said,
			.said :where(span, b) {
				font-family: var(--pg-font);
			}

			.board {
				display: grid;
				grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
				gap: 1.25em;
				align-items: start;
				width: min(32rem, 100%);
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
				font-family: var(--font-mono);
				font-size: 0.85em;
			}

			.rows {
				display: grid;
				padding: 0.35em 0;
			}

			.row {
				margin: 0;
				padding: 0.3em 0.85em;
				border: 0;
				border-radius: 0;
				background: transparent;
				color: var(--ink);
				font-family: var(--font-mono);
				font-size: 0.85em;
				line-height: 1.5;
				text-align: start;
				cursor: pointer;
				transition: background 140ms ease;
			}

			.row:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.row[aria-pressed='true'] {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.row:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: -2px;
			}

			.files {
				display: grid;
				margin: 0;
				padding: 0.35em 0;
				list-style: none;
			}

			.file {
				display: flex;
				flex-wrap: wrap;
				gap: 0.2em 0.6em;
				align-items: baseline;
				margin: 0;
				padding: 0.3em 0.85em;
				font-family: var(--font-mono);
				font-size: 0.85em;
				line-height: 1.5;
				transition: background 140ms ease;
			}

			.param {
				display: none;
				padding: 0 0.3em;
				border-radius: 3px;
				background: var(--mark);
				color: var(--on-mark);
				font-family: var(--font-mono);
			}

			.board[data-file='index'] .index,
			.board[data-file='about'] .about,
			.board[data-file='slug'] .slug,
			.board[data-file='rest'] .rest,
			.board[data-file='missing'] .missing {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.board[data-file='slug'] .slug .param,
			.board[data-file='rest'] .rest .param,
			.board[data-file='missing'] .missing .param {
				display: inline;
			}

			.answer,
			.note {
				font-family: var(--pg-font);
			}

			@media (max-width: 40rem) {
				.board {
					grid-template-columns: minmax(0, 1fr);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.row,
				.file {
					transition: none;
				}
			}
		</style>
	</PreviewCard>
}
