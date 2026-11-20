import { state } from '@markless/core';

export default function App() @{
	let phase = state('Idle');
	let kind = state('none');
	let captured = state('no');
	let moves = state(0);
	let startX = state(0);
	let lastX = state(0);
	let hovers = state(0);
	let leaves = state(0);
	let scrolled = state('Not scrolled');
	<main class="page">
		<style>
			.page {
				padding: 16px;
			}
			.pad {
				height: 120px;
				border: 2px solid #1d1b16;
				border-radius: 12px;
				background: #b7e4c7;
				touch-action: none;
			}
			.label {
				margin: 0;
				padding: 12px;
				font-size: 18px;
			}
			.line {
				margin: 6px 0;
				font-size: 18px;
			}
			.box {
				height: 160px;
				overflow-y: auto;
				border: 2px solid #1d1b16;
			}
			.tall {
				height: 600px;
				background: #e9ecef;
			}
		</style>
		<div
			class="pad"
			onPointerover={() => (hovers = hovers + 1)}
			onPointerleave={() => (leaves = leaves + 1)}
			onPointerdown={(event) => {
				event.currentTarget.setPointerCapture(event.pointerId);
				phase = 'Dragging';
				kind = event.pointerType;
				captured = event.currentTarget.hasPointerCapture(event.pointerId) ? 'yes' : 'no';
				startX = event.clientX;
				lastX = event.clientX;
				moves = 0;
			}}
			onPointermove={(event) => {
				moves = moves + 1;
				lastX = event.clientX;
			}}
			onPointerup={() => (phase = lastX - startX > 40 ? 'Dropped right' : 'Dropped')}
			onPointercancel={() => (phase = 'Cancelled')}
		>
			<p class="label">Drag me</p>
		</div>
		<p class="line">{phase}</p>
		<p class="line">Pointer {kind}</p>
		<p class="line">Captured {captured}</p>
		<p class="line">{moves > 3 ? 'Moved' : 'Still'}</p>
		<p class="line">Over {hovers} left {leaves}</p>
		<div class="box">
			<div
				class="tall"
				onPointerdown={() => (scrolled = 'Touching')}
				onPointercancel={() => (scrolled = 'Taken by the scroll')}
				onPointerup={() => (scrolled = 'Lifted')}
			>
				<p class="label">Scroll me</p>
			</div>
		</div>
		<p class="line">{scrolled}</p>
	</main>
}
