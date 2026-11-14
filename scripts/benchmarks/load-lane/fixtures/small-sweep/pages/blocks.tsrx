import { state } from '@markless/core';
import { Block } from '../src/blocks.tsrx';

// Twelve streamed blocks, each answered on its own, and a button outside them.
export default function Page() @{
	let count = state(0);

	<main>
		<button class="tap" onClick={() => count++}>Count {count}</button>
		<section class="blocks">
			<Block name="Revenue" delay={40} />
			<Block name="Orders" delay={50} />
			<Block name="Refunds" delay={60} />
			<Block name="Visitors" delay={70} />
			<Block name="Signups" delay={80} />
			<Block name="Churn" delay={90} />
			<Block name="Tickets" delay={100} />
			<Block name="Uptime" delay={110} />
			<Block name="Latency" delay={120} />
			<Block name="Errors" delay={130} />
			<Block name="Deploys" delay={140} />
			<Block name="Builds" delay={150} />
		</section>
	</main>
}
