package dev.markless.mobile.view

import android.content.ClipboardManager
import android.content.Context
import android.os.SystemClock
import android.view.KeyEvent
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputConnectionWrapper
import android.widget.EditText

/**
 * An `<input>` or `<textarea>` whose `keydown` and `paste` handlers run as Chrome on Android runs them for its on-screen
 * keyboard: typed text is `Unidentified`, a delete is `Backspace`, the action key (unless it is Next) and Return are
 * `Enter`, a key event from a hardware keyboard is its own key. Each callback answers whether the handler called
 * `preventDefault()`, which leaves out the deletion, the line break, the action or the paste.
 */
class MarklessField(context: Context) : EditText(context) {
	var onKey: ((String) -> Boolean)? = null
	var onPaste: ((String) -> Boolean)? = null
	private var enterAt = 0L

	override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
		val connection = super.onCreateInputConnection(outAttrs) ?: return null
		val key = onKey ?: return connection
		return object : InputConnectionWrapper(connection, true) {
			override fun commitText(text: CharSequence?, newCursorPosition: Int): Boolean {
				key("Unidentified")
				return super.commitText(text, newCursorPosition)
			}

			override fun setComposingText(text: CharSequence?, newCursorPosition: Int): Boolean {
				key("Unidentified")
				return super.setComposingText(text, newCursorPosition)
			}

			override fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean =
				if (beforeLength > 0 && key("Backspace")) true else super.deleteSurroundingText(beforeLength, afterLength)
		}
	}

	override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
		val key = onKey ?: return super.onKeyDown(keyCode, event)
		val name = keyName(keyCode, event) ?: return super.onKeyDown(keyCode, event)
		if (name == "Enter") enterAt = SystemClock.uptimeMillis()
		return if (key(name)) true else super.onKeyDown(keyCode, event)
	}

	override fun onEditorAction(actionCode: Int) {
		val key = onKey
		val enter = actionCode != EditorInfo.IME_ACTION_NEXT && actionCode != EditorInfo.IME_ACTION_PREVIOUS
		// One press can arrive as the Enter key and then again as the keyboard's action: the handler runs once.
		if (key != null && enter && SystemClock.uptimeMillis() - enterAt >= 500) {
			enterAt = SystemClock.uptimeMillis()
			if (key("Enter")) return
		}
		super.onEditorAction(actionCode)
	}

	override fun onTextContextMenuItem(id: Int): Boolean {
		val paste = onPaste
		if (paste != null && (id == android.R.id.paste || id == android.R.id.pasteAsPlainText)) {
			val clip = (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).primaryClip
			val text = clip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(context)?.toString() ?: ""
			if (paste(text)) return true
		}
		return super.onTextContextMenuItem(id)
	}

	private fun keyName(keyCode: Int, event: KeyEvent): String? = when (keyCode) {
		KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> "Enter"
		KeyEvent.KEYCODE_DEL -> "Backspace"
		KeyEvent.KEYCODE_FORWARD_DEL -> "Delete"
		KeyEvent.KEYCODE_ESCAPE -> "Escape"
		KeyEvent.KEYCODE_TAB -> "Tab"
		KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
		KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
		KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
		KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
		KeyEvent.KEYCODE_MOVE_HOME -> "Home"
		KeyEvent.KEYCODE_MOVE_END -> "End"
		KeyEvent.KEYCODE_PAGE_UP -> "PageUp"
		KeyEvent.KEYCODE_PAGE_DOWN -> "PageDown"
		else -> event.unicodeChar.takeIf { it != 0 }?.let { String(Character.toChars(it)) }
	}
}
