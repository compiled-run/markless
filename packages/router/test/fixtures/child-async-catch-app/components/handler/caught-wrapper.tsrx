import Saver from './saver.tsrx';

export function CaughtWrapper() @{
	<section>
		@try {
			<div>
				<Saver />
			</div>
		} @catch (error, reset) {
			<>
				<p class="caught">caught: {error.message}</p>
				<button type="button" data-reset onClick={() => reset()}>Dismiss</button>
			</>
		}
	</section>
}

export function StaticCaughtWrapper() @{
	<section>
		@try {
			<div>
				<Saver />
			</div>
		} @catch (error) {
			<p class="caught">caught: {error.message}</p>
		}
	</section>
}
