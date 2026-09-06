// The front page's opening line. It lives in a component because the margin
// scribble has to sit inline after "frameworks.", and the MDX pipeline only
// mounts .tsrx components as block-level elements, never inside a markdown
// paragraph.
export default function OpenerLine() @{
	<div class="opener-line">
		<p>
			You have learned enough frameworks.
			<span>(even if the number is zero)</span>
			This one is mostly subtraction: TypeScript functions and one word you already know, <code>state</code>.
		</p>

		<style>
			/* p span, not bare span: the prose column's global font rule is
			   .prose :is(p, ...) :is(..., span), specificity (0,1,2), and the scoped
			   selector has to tie it to win by order. */
			p span {
				display: inline-block;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step--1);
				color: var(--ink);
				opacity: 0.72;
				transform: rotate(-2deg) translateY(-0.4em);
				margin-inline: 0.15em;
			}
		</style>
	</div>
}
