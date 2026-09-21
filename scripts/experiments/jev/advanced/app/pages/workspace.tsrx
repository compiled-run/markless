import { state } from '@markless/core';
import Nav from '../components/nav.tsrx';
import Editor from '../components/editor.tsrx';
export default function Workspace() @{
  let background = state(0);
  <main data-page="workspace">
    <Nav />
    <h1>Project workspace</h1>
    <button data-testid="background" onClick={() => background++}>Background {background}</button>
    <Editor />
  </main>
}
