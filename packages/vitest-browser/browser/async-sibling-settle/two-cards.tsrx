import OrdersCard from './orders-card.tsrx';
import ProfileCard from './profile-card.tsrx';

export default function TwoCards() @{
	<div data-page="two-cards">
		<ProfileCard />
		<OrdersCard />
	</div>
}
