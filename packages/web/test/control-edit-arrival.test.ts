import { expect, test } from 'vitest';
import {
	marklessControlEditsRead,
	marklessControlWriteHeld,
	marklessNoteArrivingControlEdits,
} from '../src/control-edit-hold.ts';

function field(value: string, defaultValue = '') {
	return { tagName: 'INPUT', value, defaultValue };
}

test('a flush that would rewind text typed before any handler read it is held until one does', () => {
	const input = field('typed');
	const event = { type: 'input', target: input };
	const release = marklessNoteArrivingControlEdits(event);

	expect(marklessControlWriteHeld(input, 'value', '')).toBe(true);
	marklessControlEditsRead(event);
	expect(marklessControlWriteHeld(input, 'value', 'typed')).toBe(false);
	release();
});

test('an input event that carries no edit holds nothing back', () => {
	const input = field('');
	const event = { type: 'input', target: input };
	const release = marklessNoteArrivingControlEdits(event);

	expect(marklessControlWriteHeld(input, 'value', 'a')).toBe(false);
	release();
});

test('a value the runtime wrote is not mistaken for an edit', () => {
	const input = field('');
	expect(marklessControlWriteHeld(input, 'value', 'a')).toBe(false);
	input.value = 'a';
	const event = { type: 'input', target: input };
	const release = marklessNoteArrivingControlEdits(event);

	expect(marklessControlWriteHeld(input, 'value', '')).toBe(false);
	release();
});

test('a key event never holds a write', () => {
	const input = field('typed');
	const release = marklessNoteArrivingControlEdits({ type: 'keyup', target: input });

	expect(marklessControlWriteHeld(input, 'value', '')).toBe(false);
	release();
});

test('releasing the event lets the write through', () => {
	const input = field('typed');
	const release = marklessNoteArrivingControlEdits({ type: 'input', target: input });
	release();

	expect(marklessControlWriteHeld(input, 'value', '')).toBe(false);
});
