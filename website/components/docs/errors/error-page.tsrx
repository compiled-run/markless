// One error code's page: its plain title, the message as the terminal prints it, why it happens, the fix as a before and after, and related pages.
import { Link } from '@markless/core/router';
import Sidebar from '../sidebar.tsrx';
import SiteNavbar from '../navbar/site-navbar.tsrx';
import Sprite from '../../sprite.tsrx';
import CodeLines from './code-lines.tsrx';
import Segments from './segments.tsrx';
import { errorIndex } from './errors-index.ts';
import { findError } from './lookup.ts';
import { AREAS } from './titles.ts';
import type { ErrorEntry } from './types.ts';

const SEVERITY: Readonly<Record<ErrorEntry['severity'], string>> = {
	error: 'error',
	warning: 'warning',
	info: 'info',
	'error-or-warning': 'error or warning',
};
const STAGE: Readonly<Record<ErrorEntry['stage'], string>> = {
	compile: 'while it builds your .tsrx files',
	build: 'while Vite builds or serves your app',
	runtime: 'while a page runs',
};

/** Up to three other codes in the same area that have a written fix. */
function relatedTo(entry: ErrorEntry) {
	const group = errorIndex.groups.find((g) => g.area === entry.area);
	return (group ? group.codes : []).filter((code) => code.guided && code.code !== entry.code).slice(0, 3);
}

export default function ErrorPage({ code }: { readonly code: string }) @{
	const entry = findError(code);
	const missing = entry ? '' : code;
	const area = entry ? AREAS[entry.area] : AREAS.build;
	const printed = entry ? entry.printed.join('\n') : '';
	const varies = entry ? entry.printed.some((line) => /<\w+>/.test(line)) : false;
	const guide = entry?.guide;
	const internal = entry?.area === 'internal';
	const suggestion = entry?.suggestion ?? '';
	const related = entry ? relatedTo(entry) : [];
	const sources = entry ? entry.sources : [];
	const more = entry ? entry.moreSources : 0;
	const learn = area.learn;

	<div class="error-page">
		<SiteNavbar pathname="/errors" />
		<Sidebar pathname="/errors" />
		@if (entry) {
			<>
				<p class="crumb">
					<Link href="/errors">Error codes</Link>
					<span aria-hidden="true">/</span>
					<a href={'/errors#' + entry.area}>{area.label}</a>
				</p>
				<h1>{entry.title}</h1>
				<p class="meta">
					<code class="code">{entry.code}</code>
					<span class={'chip ' + entry.severity}>{SEVERITY[entry.severity]}</span>
					<span class="when">Markless raises it {STAGE[entry.stage]}.</span>
				</p>

				<h2 id="message">The message</h2>
				@if (printed) {
					<>
						<pre class="printed">
							<code>{printed}</code>
						</pre>
						@if (varies) {
							<p class="note">Words in angle brackets change from case to case.</p>
						}
					</>
				} @else {
					<p>This error prints its code and nothing else.</p>
				}

				<h2 id="why">Why</h2>
				@if (guide) {
					<p>
						<Segments parts={guide.what} />
					</p>
				} @else if (internal) {
					<p>Markless checks its own work as it builds and runs your app. This check failed, which means a bug in Markless, not in your code.</p>
				} @else if (entry.why) {
					<p>{entry.why}</p>
				} @else {
					<p>{entry.description}</p>
				}

				<h2 id="fix">Fix</h2>
				@if (guide) {
					<>
						<p>
							<Segments parts={guide.how} />
						</p>
						@if (guide.before.length) {
							<div class="pair">
								<div class="side">
									<p class="label broken">Before</p>
									<CodeLines lines={guide.before} />
								</div>
								<div class="side">
									<p class="label fixed">After</p>
									<CodeLines lines={guide.example} />
								</div>
							</div>
						} @else if (guide.example.length) {
							<CodeLines lines={guide.example} />
						}
					</>
				} @else if (internal) {
					<p>
						<a href="https://github.com/compiled-run/markless/issues">Open an issue</a>
						<span> with the message above and the steps that cause it.</span>
					</p>
				} @else if (suggestion) {
					<p>{suggestion}</p>
				} @else {
					<p>
						<span>Read the message above: it names the value or file involved. If it does not help, </span>
						<a href="https://github.com/compiled-run/markless/issues">open an issue</a>
						<span> with the steps that cause it.</span>
					</p>
				}
				@if (entry.allow) {
					<>
						<p>If you accept the warning on purpose, put this comment on the line above it:</p>
						<CodeLines lines={entry.allow} />
					</>
				}

				<h2 id="related">Related</h2>
				<ul class="related">
					@if (learn) {
						<li>
							<a href={learn.href}>{learn.title}</a>
						</li>
					}
					@for (const item of related; key item.code) {
						<li>
							<a href={'/errors/' + item.code}>{item.title}</a>
						</li>
					}
					<li>
						<Link href="/tooling/diagnostics">How to read a Markless error</Link>
					</li>
				</ul>
				<details class="sources">
					<summary>Where Markless raises it</summary>
					<ul>
						@for (const source of sources; key source.id) {
							<li>
								<a href={source.url}>{source.file}</a>
							</li>
						}
					</ul>
					@if (more) {
						<p class="note">And {more} more files.</p>
					}
				</details>
			</>
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
			<Link href="/errors">All error codes</Link>
		</p>

		<style>
			h1 {
				overflow-wrap: anywhere;
			}

			.crumb {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4em;
				margin-bottom: var(--space-xs);
				opacity: 0.8;
			}

			.meta {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4em 0.7em;
				align-items: baseline;
			}

			.code {
				font-family: var(--font-mono);
				font-size: 0.85rem;
				overflow-wrap: anywhere;
			}

			.chip {
				padding: 0 0.45em;
				border: 1.5px solid currentColor;
				border-radius: 5px 7px 6px 8px;
				font: 600 0.85rem/1.5 'Joy Elia', system-ui, sans-serif;
				letter-spacing: 0.05em;
			}

			.chip.error,
			.chip.error-or-warning {
				color: color-mix(in oklch, var(--pink) 55%, var(--ink));
			}

			.when {
				color: color-mix(in oklch, var(--ink) 75%, transparent);
			}

			.printed code {
				display: block;
				white-space: pre-wrap;
				text-indent: 2ch hanging each-line;
				overflow-wrap: anywhere;
			}

			.pair {
				display: grid;
				gap: var(--space-xs);
			}

			.side {
				min-width: 0;
			}

			.label {
				margin: 0 0 0.2rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 1.05rem;
				letter-spacing: 0.05em;
			}

			.label.broken {
				color: color-mix(in oklch, var(--pink) 55%, var(--ink));
			}

			.related {
				padding-left: 1.2em;
			}

			.note {
				font-size: var(--step--1);
				opacity: 0.8;
			}

			.sources {
				margin-top: var(--space-m);
			}

			.sources summary {
				cursor: pointer;
			}

			.sources a {
				overflow-wrap: anywhere;
			}

			.missing {
				margin-top: var(--space-l);
			}

			.back {
				margin-top: var(--space-l);
				padding-top: var(--space-s);
				border-top: 2px dashed var(--code-edge);
			}
		</style>
	</div>
}
