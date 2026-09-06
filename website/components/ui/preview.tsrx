// The stage at the top of every UI family page: one line saying what to do and
// what to watch, then the live component under it. A family's
// components/demos/ui/<family>/basic.tsrx composes this frame around its own
// example and the page renders that; an .mdx page cannot wrap a component in
// this one itself, because MDX component children are lowered to static HTML.
//
// Props only, no state and no construct: a page's islands are located by
// counting the elements before them, and every cell or arm this component added
// would move the ones after it (NOTES.md findings 25 and 29). Every demo's state
// lives in the projected component, which is its own island.
export default function Preview({
	shows,
	children,
}: {
	readonly shows: string;
	readonly children?: unknown;
}) @{
	<div class="ui-preview">
		<style>
			/* The stage at the top of a family page: the instruction, then the live
			   component the page projects into it. */
			.ui-preview {
				display: grid;
				gap: var(--space-s);
				place-items: center;
				margin-block: var(--space-m);
				padding: var(--space-m) var(--space-s);
				border: 2px solid var(--code-edge);
				border-radius: 4px;
				background: var(--raised);
				text-align: center;
			}

			.ui-preview-shows {
				margin: 0;
				font-weight: 700;
			}

			.ui-preview-stage {
				display: grid;
				place-items: center;
				width: 100%;
				text-align: left;
			}
		</style>
		<p class="ui-preview-shows">{shows}</p>
		<div class="ui-preview-stage">{children}</div>
	</div>
}
