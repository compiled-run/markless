import { Link } from '@markless/core/router';
import Sidebar from '../sidebar.tsrx';
import ThemeToggle from '../theme-toggle.tsrx';
import Sprite from '../../sprite.tsrx';
import CodeLines from './code-lines.tsrx';
import Segments from './segments.tsrx';
import { findError } from './lookup.ts';
import type { ErrorEntry } from './types.ts';

const SEVERITY: Readonly<Record<ErrorEntry['severity'], string>> = {
	error: 'Error',
	warning: 'Warning',
	info: 'Info',
	'error-or-warning': 'Error or warning',
};
const STAGE: Readonly<Record<ErrorEntry['stage'], string>> = {
	compile: 'Markless reports this while it builds your .tsrx files.',
	build: 'Markless reports this while Vite builds or serves your app.',
	runtime: 'Markless reports this while a page renders or runs.',
};

export default function ErrorPage({ code }: { readonly code: string }) @{
	const entry = findError(code);
	const missing = entry ? '' : code;
	const severity = entry ? SEVERITY[entry.severity] : '';
	const stage = entry ? STAGE[entry.stage] : '';
	const tone = entry?.severity === 'warning' ? 'tag warning' : 'tag';
	const printed = entry ? entry.printed.join('\n') : '';
	const varies = entry ? entry.printed.some((line) => /<\w+>/.test(line)) : false;
	const intro = entry?.structured
		? 'Markless prints the message, the reason, and a suggestion:'
		: 'The error carries this text:';
	const guide = entry?.guide;
	const sources = entry ? entry.sources : [];
	const more = entry ? entry.moreSources : 0;
	const words = (entry ? entry.code : '')
		.split('_')
		.map((text, index, all) => ({ id: 'w' + index, text: index < all.length - 1 ? text + '_' : text }));

	<div class="error-page">
		<Sidebar pathname="/errors" />
		<ThemeToggle />
		@if (entry) {
			<p class="crumb">
				<Link href="/errors">Error codes</Link>
				<span aria-hidden="true">/</span>
				<span>{entry.packageName}</span>
			</p>
			<h1 class="code-title">
				@for (const word of words; key word.id) {
					<span>{word.text}</span>
					<wbr />
				}
			</h1>
			<p class="summary">{entry.description}</p>
			<p class="meta">
				<span class={tone}>{severity}</span>
				<span>{stage}</span>
			</p>

			<h2 id="what-happened">What happened</h2>
			@if (guide) {
				<p>
					<Segments parts={guide.what} />
				</p>
			}
			@if (printed) {
				<p>{intro}</p>
				<pre class="printed">
					<code>{printed}</code>
				</pre>
				@if (varies) {
					<p class="note">Words in angle brackets change from case to case.</p>
				}
			} @else if (!guide) {
				<p>This error has no message text. The code is the whole message.</p>
			}

			<h2 id="how-to-fix-it">How to fix it</h2>
			@if (guide) {
				<p>
					<Segments parts={guide.how} />
				</p>
				@if (guide.example.length) {
					<CodeLines lines={guide.example} />
				}
			} @else {
				<p>
					@if (printed && entry.structured) {
						<span>Start with the suggestion in the message above.</span>
					} @else {
						<span>Read the message above. It names the value or file involved.</span>
					}
					<span> This code has no written guide yet. If the message does not help, </span>
					<a href="https://github.com/compiled-run/markless/issues">open an issue</a>
					<span> with the steps that cause it.</span>
				</p>
			}
			@if (entry.allow) {
				<p>If you accept the warning on purpose, put this comment on the line above it:</p>
				<CodeLines lines={entry.allow} />
			}

			<h2 id="where-it-comes-from">Where it comes from</h2>
			<p>
				<code>{entry.packageName}</code>
				<span> raises this code, in these files:</span>
			</p>
			<ul class="sources">
				@for (const source of sources; key source.id) {
					<li>
						<a href={source.url}>{source.file}</a>
					</li>
				}
			</ul>
			@if (more) {
				<p class="note">And {more} more files.</p>
			}
		} @else {
			<div class="missing">
				<Sprite name="thought-bubble" size="3rem" />
				<h1>No error with that code</h1>
				<p>
					<span>Markless has no error called </span>
					<code>{missing}</code>
					<span>. Check the spelling against the message you saw, or look it up in the list.</span>
				</p>
			</div>
		}
		<p class="back">
			<Link href="/tooling/diagnostics">How to read a Markless error</Link>
			<span aria-hidden="true">·</span>
			<Link href="/errors">All error codes</Link>
		</p>

		<style>
			h1 {
				overflow-wrap: anywhere;
			}

			.code-title {
				font-size: var(--step-3);
			}

			.crumb {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4em;
				margin-bottom: var(--space-xs);
				font-size: var(--step--1);
				opacity: 0.8;
			}

			.summary {
				max-width: 46ch;
				font-size: var(--step-1);
				line-height: 135%;
				opacity: 0.8;
			}

			.meta {
				display: flex;
				flex-wrap: wrap;
				gap: 0.6em;
				align-items: baseline;
			}

			.tag {
				padding: 0.1em 0.6em;
				border: 2px solid var(--ink);
				border-radius: 999px;
				background: var(--pink);
				color: var(--on-accent);
				font-weight: 700;
			}

			.tag.warning {
				background: var(--yellow);
			}

			.printed code {
				white-space: pre-wrap;
				overflow-wrap: anywhere;
			}

			.note {
				font-size: var(--step--1);
				opacity: 0.8;
			}

			.sources a {
				overflow-wrap: anywhere;
			}

			.missing {
				margin-top: var(--space-l);
			}

			.back {
				display: flex;
				flex-wrap: wrap;
				gap: 0.6em;
				margin-top: var(--space-l);
				padding-top: var(--space-s);
				border-top: 2px dashed var(--code-edge);
			}
		</style>
	</div>
}
