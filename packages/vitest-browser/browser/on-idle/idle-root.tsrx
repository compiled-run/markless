export function App() @{
	<section
		data-idle-root
		onIdle={() => {
			const host = globalThis as { __idleArmRuns?: number };
			host.__idleArmRuns = (host.__idleArmRuns ?? 0) + 1;
		}}
	>
		root host
	</section>
}
