// Attributes from the HTML, SVG, ARIA and XML namespace specs, on the elements that define them.
export function Page({ when }: { readonly when: string }) @{
	<article>
		<time datetime={when}>today</time>
		<ins datetime="2026-01-01" cite="/changes">added</ins>
		<del datetime="2025-12-31">removed</del>
		<details name="faq" open>
			<summary>Question</summary>
		</details>
		<dialog open closedby="any"></dialog>
		<link rel="preload" href="/font.woff2" as="font" fetchpriority="high" integrity="sha384-x" />
		<img src="/a.png" alt="" fetchpriority="low" loading="lazy" />
		<ol reversed start={3}>
			<li value={3}>three</li>
		</ol>
		<progress value={1} max={4}></progress>
		<meter low={1} high={3} optimum={2} value={2}></meter>
		<blockquote cite="/source">quote</blockquote>
		<iframe src="/embed" allow="fullscreen" title="embed"></iframe>
		<div autocorrect="off" exportparts="label" writingsuggestions="false"></div>
		<button type="button" aria-label="Close" aria-expanded="false" aria-controls="menu" role="tab">x</button>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			xmlns:xlink="http://www.w3.org/1999/xlink"
			viewBox="0 0 24 24"
			width="24"
			height="24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<defs>
				<linearGradient id="fade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="24">
					<stop offset="0" stop-color="#fff" stop-opacity="1" />
				</linearGradient>
				<filter id="blur">
					<feGaussianBlur stdDeviation="2" in="SourceGraphic" />
				</filter>
				<path id="curve" d="M0 12 Q12 0 24 12" />
			</defs>
			<path d="M0 0L24 24" stroke-linecap="round" fill-rule="evenodd" clip-path="url(#c)" />
			<circle cx={12} cy={12} r={4} />
			<text text-anchor="middle" dominant-baseline="central">
				<textPath href="#curve" startOffset="50%" xlink:href="#curve">label</textPath>
			</text>
			<use href="#curve" x={0} y={0} />
		</svg>
	</article>
}
