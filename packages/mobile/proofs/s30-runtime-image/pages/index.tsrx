import { state } from '@markless/core';

type Product = { readonly id: string; readonly name: string; readonly image: string };

export default function Gallery() @{
	let products = state<ReadonlyArray<Product>>([
		{ id: 'lamp', name: 'Desk lamp', image: '/images/lamp.png' },
		{ id: 'chair', name: 'Arm chair', image: '/images/chair.svg' },
		{ id: 'mug', name: 'Tall mug', image: '/images/mug.png' },
	]);
	let photo = state('');
	<main class="page">
		<style>
			.page {
				padding: 16px;
				background: #e9ecef;
			}
			.heading {
				margin: 0 0 12px;
				font-size: 26px;
				font-weight: 700;
				color: #212529;
			}
			.grid {
				display: grid;
				grid-template-columns: repeat(3, minmax(0, 1fr));
				gap: 8px;
			}
			.card {
				display: grid;
				grid-template-columns: minmax(0, 1fr);
				overflow: hidden;
				border-radius: 12px;
				background: #ffffff;
			}
			.card img {
				display: block;
				width: 100%;
				height: auto;
				aspect-ratio: 4 / 3;
				object-fit: cover;
			}
			.name {
				padding: 8px 10px 10px;
				font-size: 15px;
				color: #212529;
			}
			.photo {
				display: flex;
				align-items: center;
				gap: 12px;
				margin-top: 16px;
			}
			.thumb {
				width: 72px;
				min-width: 72px;
				height: 72px;
				border: 2px solid #264653;
				border-radius: 16px;
				object-fit: contain;
				object-position: 0% 100%;
			}
			.status {
				font-size: 15px;
				color: #495057;
			}
			.action {
				display: block;
				width: 100%;
				margin-top: 12px;
				padding: 10px 16px;
				border: 2px solid #264653;
				border-radius: 10px;
				background: #ffffff;
				color: #264653;
				font-family: inherit;
				font-size: 17px;
				text-align: left;
			}
		</style>
		<title>Gallery</title>
		<h1 class="heading">Gallery</h1>
		<div class="grid">
			@for (const product of products; key product.id) {
				<div class="card">
					<img src={product.image} alt="" width="400" height="300" />
					<span class="name">{product.name}</span>
				</div>
			}
		</div>
		<div class="photo">
			<img class="thumb" src={photo === '' ? undefined : photo} alt="" />
			<span class="status">{photo === '' ? 'No photo yet' : 'Photo added'}</span>
		</div>
		<button
			type="button"
			class="action"
			onClick={() =>
				(products = products.map((product) =>
					product.id === 'lamp' ? { ...product, name: 'Lit lamp', image: '/images/lamp-lit.svg' } : product,
				))
			}
		>
			Light the lamp
		</button>
		<button type="button" class="action" onClick={() => (photo = '/images/photo.png')}>
			Add a photo
		</button>
	</main>
}
