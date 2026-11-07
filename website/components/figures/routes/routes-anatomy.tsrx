// An editor's pages/ folder beside a browser: drop a file into pages/, and the browser can visit the address its path makes.
import { computed, state } from '@markless/core';
import { ABOUT_URL, describe, FIRST_SLUG, postUrl, type Spot, typeSlug, viewOf } from './model.ts';
import { art } from './routes.art.ts';

export default function RoutesAnatomy() @{
	let about = state<Spot>('out');
	let slugFile = state<Spot>('out');
	let slug = state(FIRST_SLUG);
	let url = state('/');
	let drag = state('');
	let dx = state(0);
	let dy = state(0);
	let beat = state('rest');
	let said = state('');
	let touched = state(false);
	const view = computed(() => viewOf(url, about, slugFile));
	const aboutDrag = computed(() => (drag === 'about' ? 'translate: ' + dx + 'px ' + dy + 'px' : ''));
	const slugDrag = computed(() => (drag === 'slug' ? 'translate: ' + dx + 'px ' + dy + 'px' : ''));
	const visit = (next: string) => {
		url = next;
		beat = beat === 'odd' ? 'even' : 'odd';
		said = describe(next, viewOf(next, about, slugFile));
	};
	const place = (file: 'about' | 'slug', where: Spot) => {
		if (file === 'about') about = where;
		else slugFile = where;
		visit(file === 'about' ? ABOUT_URL : postUrl(slug));
	};
	const start = (event: PointerEvent, file: 'about' | 'slug') => {
		touched = true;
		const svg = (event.currentTarget as SVGGraphicsElement).ownerSVGElement;
		if (!svg) return;
		try {
			svg.setPointerCapture(event.pointerId);
		} catch {}
		svg.dataset.x = String(event.clientX);
		svg.dataset.y = String(event.clientY);
		drag = file;
		dx = 0;
		dy = 0;
	};
	const scaleOf = (svg: SVGSVGElement) => {
		const box = svg.getBoundingClientRect();
		return box.width ? art.width / box.width : 1;
	};
	const move = (event: PointerEvent) => {
		const svg = event.currentTarget as SVGSVGElement;
		if (drag === '' || svg.dataset.x === undefined) return;
		const k = scaleOf(svg);
		dx = (event.clientX - Number(svg.dataset.x)) * k;
		dy = (event.clientY - Number(svg.dataset.y)) * k;
	};
	const end = (event: PointerEvent) => {
		const svg = event.currentTarget as SVGSVGElement;
		if (drag === '' || svg.dataset.x === undefined) return;
		delete svg.dataset.x;
		const file = drag === 'about' ? 'about' : 'slug';
		const box = svg.getBoundingClientRect();
		const k = scaleOf(svg);
		const x = (event.clientX - box.left) * k;
		const y = (event.clientY - box.top) * k;
		const moved = Math.hypot(dx, dy) > 6;
		const inTree = x >= art.tree.x0 && x <= art.tree.x1 && y >= art.tree.y0 && y <= art.tree.y1;
		const was = file === 'about' ? about : slugFile;
		drag = '';
		dx = 0;
		dy = 0;
		const next: Spot = moved ? (inTree ? 'in' : 'out') : was === 'in' ? 'out' : 'in';
		if (moved && next === was) return;
		place(file, next);
	};

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let seen = true;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen || touched) return;
				place('about', about === 'in' ? 'out' : 'in');
			}, 3600);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
		onKeyDown={(event) => {
			if (event.key === 'Escape') {
				touched = true;
				about = 'out';
				slugFile = 'out';
				slug = FIRST_SLUG;
				url = '/';
				beat = 'rest';
				said = 'Back to the start: only index.tsrx in pages/, and the browser at /.';
			}
		}}
	>
		<svg
			class="scene"
			data-view={view}
			data-about={about}
			data-slug={slugFile}
			data-beat={beat}
			data-drag={drag}
			style={art.slots}
			viewBox={'0 0 ' + art.width + ' ' + art.height}
			onPointermove={(event) => move(event)}
			onPointerup={(event) => end(event)}
			onPointercancel={(event) => end(event)}
		>
			<path class="hatch light" d={art.desk} />
			<path class="hatch light" d={art.editor.shadow} />
			<path class="paper" d={art.editor.paper} />
			<path class="hatch faint" d={art.editor.bar} />
			<path class="ink" d={art.editor.ink} />
			<path class="ink" d={art.editor.icons} />
			<path class="ink faint" d={art.editor.guide} />
			<path class="slots" d={art.editor.slots} />
			<text class="code folder" x={art.editor.labels.pages[0]} y={art.editor.labels.pages[1]}>pages/</text>
			<text class="code" x={art.editor.labels.index[0]} y={art.editor.labels.index[1]}>index.tsrx</text>
			<text class="code folder" x={art.editor.labels.blog[0]} y={art.editor.labels.blog[1]}>blog/</text>

			<path class="hatch light" d={art.browser.shadow} />
			<path class="paper" d={art.browser.paper} />
			<path class="hatch faint" d={art.browser.bar} />
			<path class="ink" d={art.browser.ink} />
			<g
				class="toy address-bar"
				tabindex="0"
				role="textbox"
				aria-label={'Address bar, ' + url + '. Type a slug to visit a post.'}
				onClick={() => {
					touched = true;
				}}
				onKeyDown={(event) => {
					if (event.key === 'Backspace' || event.key.length === 1) {
						touched = true;
						slug = typeSlug(slug, event.key);
						visit(postUrl(slug));
					}
				}}
			>
				<path class="field" d={art.browser.field} />
				<path class="wash yellow" d={art.browser.field} />
				<path class="ink" d={art.browser.fieldInk} />
				<text class="url" x={art.browser.address[0]} y={art.browser.address[1]}>{url}</text>
			</g>
			<g class="page home">
				<text class="heading" x={art.browser.heading[0]} y={art.browser.heading[1]}>Home</text>
				<path class="ink faint" d={art.browser.lines} />
			</g>
			<g class="page about">
				<text class="heading" x={art.browser.heading[0]} y={art.browser.heading[1]}>About</text>
				<path class="ink faint" d={art.browser.lines} />
			</g>
			<g class="page post">
				<text class="heading" x={art.browser.heading[0]} y={art.browser.heading[1]}>{slug}</text>
				<path class="ink faint" d={art.browser.lines} />
			</g>
			<g class="page missing">
				<text class="big" x={art.browser.big[0]} y={art.browser.big[1]}>404</text>
				<path class="ink faint" d={art.browser.missLine} />
			</g>

			<g
				class="toy file about-file"
				tabindex="0"
				role="button"
				aria-label={'about.tsrx, ' + (about === 'in' ? 'in pages/. Press to take it out.' : 'on the desk. Press, or drag it into pages/.')}
				style={aboutDrag}
				data-dragging={drag === 'about' ? '' : undefined}
				onPointerdown={(event) => start(event, 'about')}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						touched = true;
						place('about', about === 'in' ? 'out' : 'in');
					}
				}}
			>
				<g class="lift">
					<path class="hatch light" d={art.about.shadow} />
					<path class="paper" d={art.about.paper} />
					<path class="ink" d={art.about.ink} />
					<text class="code" x={art.about.name[0]} y={art.about.name[1]}>about.tsrx</text>
				</g>
			</g>
			<g
				class="toy file slug-file"
				tabindex="0"
				role="button"
				aria-label={'[slug].tsrx, ' + (slugFile === 'in' ? 'in pages/blog/. Press to take it out.' : 'on the desk. Press, or drag it into pages/blog/.')}
				style={slugDrag}
				data-dragging={drag === 'slug' ? '' : undefined}
				onPointerdown={(event) => start(event, 'slug')}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						touched = true;
						place('slug', slugFile === 'in' ? 'out' : 'in');
					}
				}}
			>
				<g class="lift">
					<path class="hatch light" d={art.slug.shadow} />
					<path class="paper" d={art.slug.paper} />
					<path class="ink" d={art.slug.ink} />
					<text class="code" x={art.slug.name[0]} y={art.slug.name[1]}>[slug].tsrx</text>
					<text class="pencil" x={art.slug.name[0] + 6} y={art.slug.name[1] - 13}>{slug}</text>
				</g>
			</g>
		</svg>
		<p class="hint" aria-hidden="true">
			<span class="hint-about">about.tsrx makes <code>{ABOUT_URL}</code></span>
			<span class="hint-slug">[slug].tsrx makes <code>{'/blog/' + slug}</code></span>
			<span class="hint-bar">type a slug</span>
		</p>
		<figcaption class="sr">
			An editor window shows a pages/ folder holding index.tsrx and an empty blog/ folder. Two files wait on the desk: about.tsrx and
			[slug].tsrx. Beside it, a browser shows the address /. Drag about.tsrx into pages/, or press it, and the browser goes to /about and
			shows the About page. Drag [slug].tsrx into blog/ and the browser goes to /blog/hello, with hello pencilled over [slug]. Type in the
			address bar to change the slug. Take a file back out, and its address shows a 404 page.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				touch-action: pan-y;
				user-select: none;
				-webkit-user-select: none;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--sheet-ink: var(--ink);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
				}
			}

			.paper,
			.field {
				fill: var(--sheet);
			}

			.ink {
				fill: var(--sheet-ink);
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.75;
				stroke-linecap: round;
			}

			.light {
				opacity: 0.5;
			}

			.faint {
				opacity: 0.35;
			}

			.hatch.faint {
				opacity: 0.25;
			}

			.slots {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-dasharray: 3 4;
				opacity: 0.4;
			}

			.wash {
				mix-blend-mode: multiply;
			}

			.yellow {
				fill: var(--yellow);
				opacity: 0;
			}

			.code,
			.url,
			.heading,
			.big,
			.pencil {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--sheet-ink);
			}

			.code {
				font-size: 13px;
				font-weight: 700;
			}

			.folder {
				font-size: 14px;
			}

			.url {
				font-size: 14px;
				font-weight: 700;
			}

			.heading {
				font-size: 30px;
				font-weight: 800;
			}

			.big {
				font-size: 72px;
				font-weight: 800;
				text-anchor: middle;
			}

			.pencil {
				font-size: 12px;
				font-style: italic;
				opacity: 0;
				fill-opacity: 0.7;
			}

			.scene[data-slug='in'] .pencil {
				opacity: 1;
			}

			.page {
				opacity: 0;
				transition: opacity 200ms ease;
			}

			.scene[data-view='home'] .page.home,
			.scene[data-view='about'] .page.about,
			.scene[data-view='post'] .page.post,
			.scene[data-view='missing'] .page.missing {
				opacity: 1;
			}

			.toy {
				outline: none;
			}

			.file {
				cursor: grab;
			}

			.file:not([data-dragging]) {
				transition: transform 260ms cubic-bezier(0.3, 1.3, 0.5, 1);
			}

			.scene[data-about='in'] .about-file {
				transform: translate(var(--about-x), var(--about-y));
			}

			.scene[data-slug='in'] .slug-file {
				transform: translate(var(--slug-x), var(--slug-y));
			}

			.file[data-dragging] {
				cursor: grabbing;
			}

			.lift {
				transform-box: fill-box;
				transform-origin: center;
				transition: transform 160ms ease;
			}

			.file:hover .lift,
			.file:focus-visible .lift {
				transform: translateY(-3px) rotate(-1deg);
			}

			.hint {
				min-height: 1.6em;
				margin: 0.3rem 0 0;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				text-align: center;
			}

			.hint span {
				display: none;
			}

			.anatomy:has(.about-file:hover, .about-file:focus-visible, .about-file[data-dragging]) .hint-about,
			.anatomy:has(.slug-file:hover, .slug-file:focus-visible, .slug-file[data-dragging]) .hint-slug,
			.anatomy:has(.address-bar:hover, .address-bar:focus-visible) .hint-bar {
				display: inline;
			}

			.file:focus-visible .paper,
			.address-bar:focus-visible .field {
				stroke: var(--ink);
				stroke-width: 1.4;
				stroke-dasharray: 4 4;
			}

			.address-bar {
				cursor: text;
			}

			.scene[data-beat='odd'] .address-bar .yellow {
				animation: ink-a 1200ms ease-out both;
			}

			.scene[data-beat='even'] .address-bar .yellow {
				animation: ink-b 1200ms ease-out both;
			}

			@keyframes ink-a {
				0% {
					opacity: 0;
				}
				25% {
					opacity: 0.85;
				}
				100% {
					opacity: 0.3;
				}
			}

			@keyframes ink-b {
				0% {
					opacity: 0;
				}
				25% {
					opacity: 0.85;
				}
				100% {
					opacity: 0.3;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.scene *,
				.scene .file {
					animation: none !important;
					transition: none !important;
				}
			}

			.sr {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}
		</style>
	</figure>
}
