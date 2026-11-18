import Basket from './basket.tsrx';
import { Shipment } from './shipment.tsrx';

export default function ComposedPage() @{
	<main>
		<Basket />
		<Shipment />
	</main>
}
