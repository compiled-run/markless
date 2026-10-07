import { checkbox } from '../../../headless/components/src/index.ts';

function Check(props: { readonly label: string }) @{
	<svg viewBox="0 0 24 24" aria-label={props.label} data-mark><path d="M20 6 9 17l-5-5" /></svg>
}

// An indicator holding an element, not text, on boxes that start each way.
export function Boxes() @{
	<section data-boxes>
		<checkbox.root data-case="icon-off">
			<checkbox.trigger data-trigger>
				<checkbox.indicator>
					<svg viewBox="0 0 24 24" aria-hidden="true" data-mark><path d="M20 6 9 17l-5-5" /></svg>
				</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label>Icon off</checkbox.label>
		</checkbox.root>
		<checkbox.root data-case="component-off">
			<checkbox.trigger data-trigger>
				<checkbox.indicator>
					<Check label="ticked" />
				</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label>Component off</checkbox.label>
		</checkbox.root>
		<checkbox.root data-case="span-off">
			<checkbox.trigger data-trigger>
				<checkbox.indicator>
					<span class="tick" data-mark>x</span>
				</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label>Span off</checkbox.label>
		</checkbox.root>
		<checkbox.root data-case="span-on" checked>
			<checkbox.trigger data-trigger>
				<checkbox.indicator>
					<span class="tick" data-mark>x</span>
				</checkbox.indicator>
			</checkbox.trigger>
			<checkbox.label>Span on</checkbox.label>
		</checkbox.root>
	</section>
}
