import InkLogo, { type Mark } from './ink-logo.tsrx';

/** A quiet row of frameworks, each name after an ink drawing of its mark, for under a subtitle that already names them; hidden from screen readers so they hear the names once. `marks` lists `mark:Name` pairs, space separated. */
export default function FrameworkLogos({ marks }: { readonly marks: string }) @{
	const items = marks.split(' ').map((pair) => {
		const [mark, name] = pair.split(':') as [Mark, string];
		return { mark, name };
	});

	<p class="framework-logos" aria-hidden="true">
		@for (const item of items; key item.mark) {
			<span class="framework">
				<InkLogo mark={item.mark} />
				{item.name}
			</span>
		}
		<style>
			.framework-logos {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4em 1.1em;
				margin-block: calc(var(--space-m) * -0.5) var(--space-m);
				opacity: 0.72;
			}

			.framework {
				white-space: nowrap;
			}
		</style>
	</p>
}
