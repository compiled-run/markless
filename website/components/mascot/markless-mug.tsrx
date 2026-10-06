import MugArt from './mug-art.tsrx';

// The Markless mascot as the live drawing. `variant` names a placement: `mark` sits
// beside the site name, `hero` floats beside the landing title, `tile` fills a card.
export default function MarklessMug({
	variant,
	size,
	mood,
	drawn,
	announced,
}: {
	readonly variant: string;
	readonly size: string;
	readonly mood: string;
	/** The drawing's own size, when it should overhang a `size` box that lines up with its neighbours. */
	readonly drawn?: string;
	readonly announced?: boolean;
}) @{
	<span
		class={'mascot markless-mug is-' + variant}
		style={'--mascot-size:' + size + ';--mug-width:' + (drawn ?? size) + ';--mug-height:' + (drawn ?? size)}
		aria-hidden={announced ? undefined : 'true'}
	>
		<style>
			.markless-mug {
				display: flex;
				align-items: flex-end;
				justify-content: center;
			}
		</style>
		<MugArt
			variant={variant}
			mood={mood}
			face="neutral"
			glaze="cream"
			pour="rosetta"
			coaster="off"
			companion="off"
			paused="false"
			interacted="false"
			reaction="rest"
		/>
	</span>
}
