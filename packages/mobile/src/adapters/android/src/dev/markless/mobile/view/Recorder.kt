package dev.markless.mobile.view

import android.content.Context
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.widget.Button
import dev.markless.mobile.core.JsValue
import java.io.File

/** One recorder object on MediaRecorder: AAC in an MPEG-4 file in the cache, and its live fields. */
class RecorderObject(private val context: Context, private val changed: (field: String, value: JsValue) -> Unit) {
	private val main = Handler(Looper.getMainLooper())
	private var recorder: MediaRecorder? = null
	private var file: File? = null
	private var started = 0L
	var active = false
		private set
	var seconds = 0
		private set
	var clip: String? = null
		private set

	private val tick = object : Runnable {
		override fun run() {
			val elapsed = SystemClock.elapsedRealtime() - started
			setSeconds((elapsed / 1000).toInt())
			main.postDelayed(this, 1000 - elapsed % 1000)
		}
	}

	private fun setSeconds(now: Int) {
		seconds = now
		changed("seconds", JsValue.Num(now.toDouble()))
	}

	/** `active` goes back to false: the recorder could not start. */
	fun snapBack() = changed("active", JsValue.Bool(false))

	/** Starts recording; the caller has checked RECORD_AUDIO is granted. */
	fun start() {
		if (active) return
		val out = File(context.cacheDir, "markless-clip-${System.nanoTime()}.m4a")
		val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else @Suppress("DEPRECATION") MediaRecorder()
		try {
			r.setAudioSource(MediaRecorder.AudioSource.MIC)
			r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
			r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
			r.setOutputFile(out.path)
			r.prepare()
			r.start()
		} catch (_: Exception) {
			r.release()
			out.delete()
			return snapBack()
		}
		recorder = r
		file = out
		active = true
		started = SystemClock.elapsedRealtime()
		changed("active", JsValue.Bool(true))
		setSeconds(0)
		main.postDelayed(tick, 1000)
	}

	/** Stops recording; with [keep], `clip` becomes the file's `file:` URL. */
	fun stop(keep: Boolean) {
		val r = recorder ?: return
		main.removeCallbacks(tick)
		recorder = null
		active = false
		val out = file
		file = null
		// MediaRecorder.stop throws when nothing was recorded yet; the file is then unplayable.
		val saved = try { r.stop(); true } catch (_: RuntimeException) { false }
		r.release()
		changed("active", JsValue.Bool(false))
		if (keep && saved && out != null) {
			val url = out.toURI().toString()
			clip = url
			changed("clip", JsValue.Str(url))
		} else out?.delete()
	}

	/** Its owner left the screen: recording stops without a clip and every field returns to its initial value. */
	fun release() {
		stop(keep = false)
		active = false
		clip = null
		changed("active", JsValue.Bool(false))
		setSeconds(0)
		changed("clip", JsValue.Null)
	}
}

/** An `<audio controls>`: a Play/Pause button over a MediaPlayer for the `file:` URL in `src`. */
class AudioButton(context: Context) : Button(context) {
	private var player: MediaPlayer? = null
	private var src: String? = null
	private var label: String? = null

	init {
		isAllCaps = false
		show("Play")
		setOnClickListener { toggle() }
	}

	private fun show(state: String) {
		text = state
		contentDescription = label ?: state
	}

	/** The `aria-label`; without one the button is named by what it shows. */
	fun label(value: String?) {
		label = value
		contentDescription = value ?: text
	}

	fun source(value: String?) {
		stop()
		src = value
	}

	private fun stop() {
		player?.release()
		player = null
		show("Play")
	}

	private fun toggle() {
		val playing = player
		if (playing != null) {
			if (playing.isPlaying) { playing.pause(); show("Play") } else { playing.start(); show("Pause") }
			return
		}
		val uri = Uri.parse(src ?: return)
		val next = MediaPlayer()
		try {
			if (uri.scheme == "file") next.setDataSource(uri.path) else next.setDataSource(context, uri)
			next.prepare()
		} catch (_: Exception) {
			next.release()
			return
		}
		next.setOnCompletionListener { show("Play") }
		player = next
		next.start()
		show("Pause")
	}

	override fun onDetachedFromWindow() {
		stop()
		super.onDetachedFromWindow()
	}
}
