package dev.markless.mobile.view

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.view.Gravity
import android.webkit.MimeTypeMap
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import dev.markless.mobile.core.PickedFile
import java.io.File
import org.json.JSONArray

/**
 * `<input type="file">` as Chrome draws it unstyled: a Choose File button and what was chosen. A press, or the page's
 * `showPicker()`, opens the system's document picker with the input's `accept` and `multiple`.
 */
class FileInputView(context: Context, unseen: Boolean) : LinearLayout(context) {
	/** The files chosen, after the picker closes. */
	var onPick: ((List<PickedFile>) -> Unit)? = null
	var accept = ""
	var multiple = false
		set(value) {
			field = value
			button.text = if (value) "Choose Files" else "Choose File"
		}
	/** What was chosen, in order, for a later upload to read. */
	var chosen: List<Uri> = emptyList()
		private set
	private val button = Button(context).apply { text = "Choose File"; isAllCaps = false }
	private val summary = TextView(context).apply { text = "No file chosen" }

	init {
		orientation = HORIZONTAL
		gravity = Gravity.CENTER_VERTICAL
		button.setOnClickListener { open() }
		// A family's visually hidden field (aria-hidden) shows nothing and opens only from `showPicker()`.
		if (unseen) importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
		else {
			addView(button)
			addView(summary)
		}
	}

	/** What a handler gave the input, as a JSON array of names: it shows them as it shows a choice. */
	fun show(names: String) {
		val given = JSONArray(names)
		summary.text = when (given.length()) { 0 -> "No file chosen"; 1 -> given.getString(0); else -> "${given.length()} files" }
	}

	fun open() {
		val activity = context as? Activity ?: throw MarklessHostError("a file picker needs an Activity to open over")
		testAnswer(activity)?.let { answer ->
			post { chose(answer) }
			return
		}
		(activity as? MarklessActivity)?.picking = this
		val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
			.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
		mimeTypes(accept)?.let { intent.putExtra(Intent.EXTRA_MIME_TYPES, it) }
		activity.startActivityForResult(intent, PICK_REQUEST)
	}

	/** The picker closed: what it chose, or nothing when it was cancelled, which leaves the input as it was. */
	fun answered(resultCode: Int, data: Intent?) {
		if (resultCode != Activity.RESULT_OK || data == null) return
		val clip = data.clipData
		chose(if (clip != null) (0 until clip.itemCount).map { clip.getItemAt(it).uri } else listOfNotNull(data.data))
	}

	private fun chose(uris: List<Uri>) {
		val kept = if (multiple) uris else uris.take(1)
		chosen = kept
		summary.text = when (kept.size) { 0 -> "No file chosen"; 1 -> nameOf(kept[0]); else -> "${kept.size} files" }
		onPick?.invoke(kept.map(::described))
	}

	private fun nameOf(uri: Uri): String =
		if (uri.scheme == "file") File(uri.path!!).name
		else context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) it.getString(0) else null } ?: uri.lastPathSegment.orEmpty()

	private fun described(uri: Uri): PickedFile {
		val name = nameOf(uri)
		val byExtension = MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.', "").lowercase()).orEmpty()
		if (uri.scheme == "file") {
			val file = File(uri.path!!)
			return PickedFile(uri.toString(), name, file.length().toDouble(), byExtension, file.lastModified().toDouble())
		}
		var size = 0.0
		var modified = System.currentTimeMillis().toDouble()
		context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE, DocumentsContract.Document.COLUMN_LAST_MODIFIED), null, null, null)?.use {
			if (it.moveToFirst()) {
				if (!it.isNull(0)) size = it.getLong(0).toDouble()
				if (!it.isNull(1)) modified = it.getLong(1).toDouble()
			}
		}
		return PickedFile(uri.toString(), name, size, context.contentResolver.getType(uri) ?: byExtension, modified)
	}

	companion object {
		const val PICK_REQUEST = 4105

		/** The picker's types for an `accept` list: `.txt`, a MIME type and a wildcard such as `image/` plus `*` each name one; none, any file. */
		private fun mimeTypes(accept: String): Array<String>? = accept.split(',').map { it.trim().lowercase() }.filter { it.isNotEmpty() }.mapNotNull {
			if (it.startsWith('.')) MimeTypeMap.getSingleton().getMimeTypeFromExtension(it.drop(1)) else it
		}.takeIf { it.isNotEmpty() }?.toTypedArray()

		/**
		 * The `pick` launch extra: files every picker answers with at once, written to the app's cache. The proofs use it as
		 * the web test's file chooser does; the system picker is not ours to drive.
		 */
		private fun testAnswer(activity: Activity): List<Uri>? {
			val given = activity.intent.getStringExtra("pick") ?: return null
			val folder = File(activity.cacheDir, "markless-pick").apply { mkdirs() }
			val files = JSONArray(given)
			return (0 until files.length()).map {
				val file = files.getJSONObject(it)
				val written = File(folder, file.getString("name"))
				written.writeText(file.getString("text"))
				Uri.fromFile(written)
			}
		}
	}
}
