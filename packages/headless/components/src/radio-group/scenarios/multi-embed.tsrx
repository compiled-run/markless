import { radiogroup } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths. The unavailable option sits in the middle so the arrow walk has
// to step past it, and `overnight` is last so ArrowDown from there wraps inside
// this embed or escapes into the next one.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<radiogroup.root name="shipping" data-testid="root">
			<radiogroup.label data-testid="label">Shipping speed</radiogroup.label>
			<radiogroup.item value="standard" data-testid="standard-item">
				<radiogroup.itemfield data-testid="standard-field" />
				<radiogroup.itemtrigger data-testid="standard-trigger">
					<span data-testid="standard-dot" aria-hidden="true">o</span>
					<radiogroup.itemindicator data-testid="standard-indicator">Chosen</radiogroup.itemindicator>
				</radiogroup.itemtrigger>
				<radiogroup.itemlabel data-testid="standard-label">Standard, 5 days</radiogroup.itemlabel>
			</radiogroup.item>
			<radiogroup.item value="courier" disabled data-testid="courier-item">
				<radiogroup.itemfield data-testid="courier-field" />
				<radiogroup.itemtrigger data-testid="courier-trigger">
					<span data-testid="courier-dot" aria-hidden="true">o</span>
					<radiogroup.itemindicator data-testid="courier-indicator">Chosen</radiogroup.itemindicator>
				</radiogroup.itemtrigger>
				<radiogroup.itemlabel data-testid="courier-label">Courier, not on this route</radiogroup.itemlabel>
			</radiogroup.item>
			<radiogroup.item value="overnight" data-testid="overnight-item">
				<radiogroup.itemfield data-testid="overnight-field" />
				<radiogroup.itemtrigger data-testid="overnight-trigger">
					<span data-testid="overnight-dot" aria-hidden="true">o</span>
					<radiogroup.itemindicator data-testid="overnight-indicator">Chosen</radiogroup.itemindicator>
				</radiogroup.itemtrigger>
				<radiogroup.itemlabel data-testid="overnight-label">Overnight</radiogroup.itemlabel>
			</radiogroup.item>
		</radiogroup.root>
	</section>
}
