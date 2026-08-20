import { Frame, Handle } from './composite-refresh.tsrx';

export default function CompositeRefreshPage() @{
	<div data-composite-page>
		<div data-widget="left">
			<Frame pinned={true}>
				<Handle />
			</Frame>
		</div>
		<div data-widget="right">
			<Frame pinned={false}>
				<Handle />
			</Frame>
		</div>
	</div>
}
