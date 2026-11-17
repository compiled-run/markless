import { Frame } from './prop-frame.tsrx';
import { Ticker } from './prop-ticker.tsrx';

export default function PropPage() @{
	<main>
		<Frame Body={Ticker} />
	</main>
}
