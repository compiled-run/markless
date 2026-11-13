import { Saver } from './saver.tsrx';

export function Wrapper() @{
	<section>
		<Saver />
	</section>
}

export function CaughtWrapper() @{
	<section>
		@try {
			<div>
				<Saver />
			</div>
		} @catch (error, reset) {
			<>
				<p data-caught>caught: {error.message}</p>
				<button type="button" data-reset onClick={() => reset()}>Dismiss</button>
			</>
		}
	</section>
}
