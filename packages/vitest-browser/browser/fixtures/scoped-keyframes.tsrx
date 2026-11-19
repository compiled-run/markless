export function App() @{
	<section>
		<style>
			@keyframes fade-out { to { opacity: 0.25; } }
			.popup { animation: fade-out 1s -1s paused both; }
		</style>
		<p class="popup" data-popup>popup</p>
		<Erased />
	</section>
}

function Erased() @{
	<div>
		<style>
			@keyframes fade-out { to { opacity: 0; } }
			.erased { animation: 1s paused both fade-out; animation-delay: -1s; }
		</style>
		<p class="erased" data-erased>erased</p>
	</div>
}
