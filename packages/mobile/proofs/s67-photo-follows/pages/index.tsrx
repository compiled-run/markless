import { state } from '@markless/core';

export default function Checkin() @{
	let photo = state('');
	let tapped = state(false);
	<main class="page">
		<style>
			.photo {
				display: block;
				width: 100%;
				max-height: 320px;
				object-fit: cover;
			}
			.title {
				margin: 12px 16px 4px;
				font-size: 26px;
				font-weight: 700;
				color: #212529;
			}
			.action {
				display: block;
				width: calc(100% - 32px);
				margin: 8px 16px;
				padding: 10px 16px;
				border: 2px solid #264653;
				border-radius: 10px;
				background: #ffffff;
				color: #264653;
				font-family: inherit;
				font-size: 17px;
				text-align: left;
			}
			.status {
				margin: 4px 16px;
				font-size: 15px;
				color: #495057;
			}
		</style>
		<title>Check-in</title>
		<img class="photo" src={photo === '' ? undefined : photo} alt="" aria-label="Walk photo" />
		<h1 class="title">Morning walk</h1>
		<button type="button" class="action" onClick={() => (photo = '/images/photo.png')}>
			Add a photo
		</button>
		<button type="button" class="action" onClick={() => (tapped = true)}>
			Below the photo
		</button>
		<p class="status">{photo === '' ? 'No photo yet' : 'Photo added'}</p>
		<p class="status">{tapped ? 'Tapped below' : 'Not tapped'}</p>
	</main>
}
