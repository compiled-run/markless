import { IsoFigure, Line, Sheet, Solid } from './draw.tsrx';
import { art } from './kit-proof.art.ts';

export default function KitProof() @{
	<Sheet label="Kit proof: a base slab with a ruler, two posts and a coil wound on the rod between them.">
		<IsoFigure width={art.width} height={art.height} label="A base slab with a tick ruler, two posts and a coiled rod between them.">
			<Solid paths={art.base} tone="mid" pencil={true}>
				<Line d={art.inlay} tone="faint" />
			</Solid>
			<Line d={art.ruler.minor} tone="lo" />
			<Line d={art.ruler.major} tone="mid" />
			<Solid paths={art.farPost} tone="hi" />
			<Line d={art.coil.back} tone="lo" />
			<Solid paths={art.rod} tone="hi" lit={true} />
			<Line d={art.coil.front} tone="hi" />
			<Solid paths={art.nearPost} tone="hi" />
		</IsoFigure>
	</Sheet>
}
