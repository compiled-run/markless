import { state } from '@markless/core';

export default function Pinning() @{
	let pinned = state(false);
	<main class="pinning">
		<style>
			.pinning {
				padding: 24px;
			}
			.check {
				display: flex;
				align-items: center;
				gap: 10px;
				min-height: 44px;
			}
			.check input {
				width: 22px;
				height: 22px;
				accent-color: #c2410c;
			}
		</style>
		<title>Pinning</title>
		<label class="check">
			<input type="checkbox" name="pinned" onChange={(event) => (pinned = (event.target as HTMLInputElement).checked)} />
			Pin to the top
		</label>
		<p>{pinned ? 'Pinned: yes' : 'Pinned: no'}</p>
	</main>
}
