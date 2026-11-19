import { computed, state } from '@markless/core';
import { camera, location, platform, settings } from '@markless/device';
import Shell from '../lib/Shell.tsrx';
import { permissionState } from '../lib/web-device.ts';

const WORDS: Record<string, string> = {
	granted: 'Allowed',
	limited: 'Allowed in part',
	denied: 'Not allowed',
	blocked: 'Not allowed',
	prompt: 'Asks first',
	unknown: 'Asks first',
};

function PhoneAccess() @{
	<div class="panel">
		<dl class="rows">
			<dt>Camera</dt>
			<dd>{WORDS[camera.access]}</dd>
			<dt>Location</dt>
			<dd>{WORDS[location.access]}</dd>
		</dl>
		@if (camera.access === 'denied' || camera.access === 'blocked' || location.access === 'denied' || location.access === 'blocked') {
			<div class="warning" role="alert">
				<p>Field notes needs the camera and location to record a check-in.</p>
				<button type="button" class="button" onClick={() => settings.open()}>
					Open Settings
				</button>
			</div>
		}
	</div>
}

function WebAccess() @{
	let checks = state(0);
	const cameraState = computed(async () => {
		checks;
		return permissionState('camera');
	});
	const locationState = computed(async () => {
		checks;
		return permissionState('geolocation');
	});

	<div class="panel" onVisible={() => checks++}>
		@try {
			<dl class="rows">
				<dt>Camera</dt>
				<dd>{WORDS[cameraState]}</dd>
				<dt>Location</dt>
				<dd>{WORDS[locationState]}</dd>
			</dl>
		} @pending {
			<p>Checking…</p>
		} @catch {
			<p>This browser does not say.</p>
		}
		<p class="hint">Change these in your browser’s site settings.</p>
	</div>
}

export default function Permissions() @{
	<Shell title="Access">
		<style>
			.rows {
				display: grid;
				grid-template-columns: 1fr auto;
				gap: 10px;
				margin: 0;
			}
			.rows dd {
				margin: 0;
				font-weight: 600;
			}
			.hint {
				margin: 0;
				color: var(--muted);
			}
		</style>
		<h1>Access</h1>
		<p>What Field notes may use on this device.</p>
		@if (!platform.web) {
			<PhoneAccess />
		} @else {
			<WebAccess />
		}
	</Shell>
}
