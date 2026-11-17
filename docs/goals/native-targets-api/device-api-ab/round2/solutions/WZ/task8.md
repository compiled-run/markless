```tsrx
// file: task8/Status.tsrx
import { compass, network } from '@markless/device';

export default function Status() @{
	<section>
		<network.root>
			<network.indicator>
				<p role="status">Offline</p>
			</network.indicator>
		</network.root>
		<compass.root>
			<p>
				Heading: <compass.label />
			</p>
		</compass.root>
	</section>
}
```
