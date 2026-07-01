import { render } from 'arcade';
import App from './App.tsrx';
import './styles.css';

const app = document.querySelector('#app');
if (!app) {
	throw new Error('Expected #app target for the music player CSR render.');
}

await render(App, { target: app });
