import { state, storage } from '@markless/core';
import { camera, location, platform, settings } from '@markless/device';
import { navigate } from '@markless/router';
import { base } from '@markless/ui';
import Shell from '../lib/Shell.tsrx';
import { addCheckIn, coordinates, SITES } from '../lib/checkins.ts';
import { browserPosition, uploadPhoto } from '../lib/web-device.ts';

type Found = { readonly latitude: string; readonly longitude: string };

function PhoneCamera({ onPhoto }: { readonly onPhoto: (url: string) => void }) @{
	const cam = camera();

	<div class="capture">
		@if (camera.access === 'denied' || camera.access === 'blocked') {
			<div class="warning" role="alert">
				<p>Camera access is off for Field notes.</p>
				<button type="button" class="button" onClick={() => settings.open()}>
					Open Settings
				</button>
			</div>
		} @else {
			<>
				<base.camera el={cam} class="preview" />
				<button
					type="button"
					class="button"
					disabled={!cam.ready}
					onClick={async () => onPhoto((await cam.takePhoto()).url)}
				>
					Take photo
				</button>
			</>
		}
	</div>
}

function PhoneLocation({ onFound }: { readonly onFound: (found: Found) => void }) @{
	<div class="locate">
		@if (location.access === 'denied' || location.access === 'blocked') {
			<div class="warning" role="alert">
				<p>Location is off for Field notes.</p>
				<button type="button" class="button" onClick={() => settings.open()}>
					Open Settings
				</button>
			</div>
		} @else {
			<button
				type="button"
				class="button"
				onClick={async () => {
					const here = await location.current();
					onFound(coordinates(here.latitude, here.longitude));
				}}
			>
				Use my location
			</button>
		}
	</div>
}

export default function NewCheckIn() @{
	let saved = storage('checkins', '[]');
	let defaultSite = storage('default-site', 'North yard');
	let photo = state('');
	let latitude = state('');
	let longitude = state('');
	let problem = state('');

	<Shell title="New check-in">
		<style>
			.form {
				display: grid;
				gap: 18px;
			}
			.field {
				display: grid;
				gap: 6px;
				font-weight: 600;
			}
			.field select,
			.field textarea {
				width: 100%;
				padding: 12px 14px;
				border: 1px solid var(--line);
				border-radius: 10px;
				background: var(--paper);
				font-weight: 400;
			}
			.field textarea {
				min-height: 120px;
			}
			.panel h2 {
				margin: 0;
				font-size: 17px;
			}
			.shot {
				width: 100%;
				max-height: 260px;
				border-radius: 12px;
				object-fit: cover;
			}
			.preview {
				display: block;
				width: 100%;
				aspect-ratio: 4 / 3;
				border-radius: 12px;
				background: #000000;
			}
			.where {
				margin: 0;
				font-variant-numeric: tabular-nums;
			}
			.actions {
				display: flex;
				justify-content: flex-end;
			}
		</style>
		<h1>New check-in</h1>
		<form
			class="form"
			onSubmit={async (event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				const added = addCheckIn(saved, {
					site: String(data.get('site')),
					note: String(data.get('note') ?? ''),
					photo,
					latitude,
					longitude,
				});
				saved = added.saved;
				// storage() saves its cookie a task later, and the next page renders on the server from that cookie.
				await new Promise((done) => setTimeout(done));
				await navigate(`/checkins/${added.id}`);
			}}
		>
			<label class="field">
				Site
				<select name="site">
					@for (const site of SITES; key site) {
						<option value={site} selected={site === defaultSite}>
							{site}
						</option>
					}
				</select>
			</label>
			<section class="panel" aria-label="Photo">
				<h2>Photo</h2>
				@if (photo !== '') {
					<img class="shot" src={photo} alt="The photo for this check-in" />
				}
				@if (!platform.web) {
					<PhoneCamera onPhoto={(url) => (photo = url)} />
				} @else {
					<label class="button">
						{photo === '' ? 'Add a photo' : 'Replace the photo'}
						<input
							class="visually-hidden"
							type="file"
							accept="image/*"
							capture="environment"
							onChange={async (event) => {
								const file = event.currentTarget.files?.[0];
								if (!file) return;
								try {
									photo = await uploadPhoto(file);
									problem = '';
								} catch (error) {
									problem = (error as Error).message;
								}
							}}
						/>
					</label>
				}
			</section>
			<section class="panel" aria-label="Location">
				<h2>Location</h2>
				<p class="where" hidden={latitude === ''}>
					{latitude}, {longitude}
				</p>
				@if (!platform.web) {
					<PhoneLocation
						onFound={(found) => {
							latitude = found.latitude;
							longitude = found.longitude;
						}}
					/>
				} @else {
					<button
						type="button"
						class="button"
						onClick={async () => {
							try {
								const here = await browserPosition();
								const found = coordinates(here.latitude, here.longitude);
								latitude = found.latitude;
								longitude = found.longitude;
								problem = '';
							} catch (error) {
								problem =
									(error as Error).name === 'NotAllowedError'
										? 'Location is blocked for this site. Allow it in your browser’s site settings.'
										: 'Your location could not be found.';
							}
						}}
					>
						Use my location
					</button>
				}
			</section>
			<div class="warning" role="alert" hidden={problem === ''}>
				<p>{problem}</p>
			</div>
			<label class="field">
				Note
				<textarea name="note" placeholder="What did you find?"></textarea>
			</label>
			<div class="actions">
				<button type="submit" class="button primary">
					Save check-in
				</button>
			</div>
		</form>
	</Shell>
}
