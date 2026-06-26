import { render } from 'arcade';
import App from './App.tsrx';
import './styles.css';

const target = document.querySelector('#root');
if (!target) {
	throw new Error('Missing #root target.');
}

await render(App, { target });
