export default function Preview({
	shows,
	children,
}: {
	readonly shows: string;
	readonly children?: unknown;
}) @{
	<div class="ui-preview">
		<p class="ui-preview-shows">{shows}</p>
		<div class="ui-preview-stage">{children}</div>
		<style>
			.ui-preview {
				position: relative;
				z-index: 2;
			}
			.ui-preview-stage {
				--ink: #202023;
				--paper: #fff;
				--raised: #fff;
				--code-edge: #c8c8cd;
				background: #fff;
				color: #202023;
				color-scheme: light;
				min-height: 12rem;
				padding: 2rem 1rem;
				box-sizing: border-box;
			}
		</style>
	</div>
}
