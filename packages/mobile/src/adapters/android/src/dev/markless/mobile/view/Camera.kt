package dev.markless.mobile.view

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.ImageReader
import android.os.Handler
import android.os.Looper
import android.view.Surface
import android.view.TextureView
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import dev.markless.mobile.core.JsValue
import java.io.File

/** A view with a fixed size in dp: a camera preview or an image keeps its box before anything is drawn in it. */
open class SizedFrame(context: Context, private val widthDp: Int, private val heightDp: Int) : FrameLayout(context) {
	override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
		val density = resources.displayMetrics.density
		val w = MeasureSpec.makeMeasureSpec((widthDp * density).toInt(), MeasureSpec.EXACTLY)
		val h = MeasureSpec.makeMeasureSpec((heightDp * density).toInt(), MeasureSpec.EXACTLY)
		super.onMeasure(w, h)
	}
}

/** An image the app packaged for an `<img src>`: its file under the APK's assets and its natural size in CSS px. */
class PackagedImage(val file: String, val width: Double, val height: Double)

/** The app's packaged images, from `markless/images.json` in the APK's assets; none when the app has no images. */
fun packagedImages(context: Context): Map<String, PackagedImage> {
	val text = runCatching { context.assets.open("markless/images.json").use { String(it.readBytes()) } }.getOrNull() ?: return emptyMap()
	val json = org.json.JSONObject(text)
	return json.keys().asSequence().associateWith { src ->
		val entry = json.getJSONObject(src)
		PackagedImage(entry.getString("file"), entry.getDouble("width"), entry.getDouble("height"))
	}
}

/**
 * An `img`: the picture at the web's size (its `width` and `height` attributes, else its natural size, keeping its ratio
 * when only one is given); when there is no picture to draw, its alt text, as the browser shows it. With a style export,
 * Dragon sizes the box ([sized] false).
 */
class SizedImage(context: Context, private val packaged: Map<String, PackagedImage>, private val sized: Boolean) : FrameLayout(context) {
	val image = ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_XY }
	private val altText = TextView(context)
	private var src: String? = null
	private var alt: String? = null
	private var width: Double? = null
	private var height: Double? = null
	private var natural: PackagedImage? = null

	init {
		addView(image, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
		addView(altText, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT))
	}

	fun src(value: String?) {
		src = value
		natural = value?.let { packaged[it] }
		// A photo the device took is a `file:` URL; any other src is a file the app packaged when it was built.
		val bitmap = natural?.let { p -> context.assets.open(p.file).use(BitmapFactory::decodeStream) }
			?: value?.takeIf { it.startsWith("file:") }?.let { android.net.Uri.parse(it).path }?.let(BitmapFactory::decodeFile)
		image.setImageBitmap(bitmap)
		refresh(bitmap != null)
	}

	fun alt(value: String?) {
		alt = value
		refresh(image.drawable != null)
	}

	fun length(name: String, value: String?) {
		val number = value?.trim()?.toDoubleOrNull()
		if (name == "width") width = number else height = number
		requestLayout()
	}

	private fun refresh(drawn: Boolean) {
		altText.text = if (drawn) null else alt
		altText.visibility = if (drawn || alt.isNullOrEmpty()) View.GONE else View.VISIBLE
		requestLayout()
	}

	override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
		if (!sized) return super.onMeasure(widthMeasureSpec, heightMeasureSpec)
		val density = resources.displayMetrics.density
		var w = width
		var h = height
		val n = natural?.takeIf { image.drawable != null && it.width > 0 && it.height > 0 }
		if (n != null) {
			if (w == null && h != null) w = h * n.width / n.height
			if (h == null && w != null) h = w * n.height / n.width
			w = w ?: n.width
			h = h ?: n.height
		}
		if (w == null || h == null) {
			super.onMeasure(widthMeasureSpec, heightMeasureSpec)
			setMeasuredDimension(w?.let { (it * density).toInt() } ?: measuredWidth, h?.let { (it * density).toInt() } ?: measuredHeight)
			return
		}
		super.onMeasure(MeasureSpec.makeMeasureSpec((w * density).toInt(), MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec((h * density).toInt(), MeasureSpec.EXACTLY))
	}
}

/** A camera's picture: a TextureView whose camera runs while the view is attached to a window. */
class CameraPreview(context: Context, private val onWindow: (attached: Boolean, preview: CameraPreview) -> Unit) : SizedFrame(context, 240, 180) {
	val texture = TextureView(context)

	init {
		addView(texture, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
	}

	override fun onAttachedToWindow() {
		super.onAttachedToWindow()
		onWindow(true, this)
	}

	override fun onDetachedFromWindow() {
		onWindow(false, this)
		super.onDetachedFromWindow()
	}
}

/** One camera object on Camera2: the camera it uses, its session while its preview is shown, and its live fields. */
class CameraObject(private val activity: Activity, private val changed: (field: String, value: JsValue) -> Unit) {
	private val main = Handler(Looper.getMainLooper())
	private val manager = activity.getSystemService(CameraManager::class.java)
	private var device: CameraDevice? = null
	private var session: CameraCaptureSession? = null
	private var reader: ImageReader? = null
	private var preview: CameraPreview? = null
	private var waitingForReady = ArrayList<() -> Unit>()
	private var capturing: ((DeviceOutcome) -> Unit)? = null
	/** Bumped by every close: a camera callback from an earlier open finds a newer generation and lets go. */
	private var generation = 0
	private var opening = false
	/** A closed camera reports `onClosed` later; opening again before that finds it still in use. */
	private var closing = false
	var ready = false
		private set
	var facing = "back"
		private set

	private fun cameraFacing(wanted: String): String? = manager.cameraIdList.firstOrNull {
		manager.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) ==
			(if (wanted == "front") CameraCharacteristics.LENS_FACING_FRONT else CameraCharacteristics.LENS_FACING_BACK)
	}

	fun shown(preview: CameraPreview) {
		this.preview = preview
		open()
	}

	/** A preview left the screen: the camera stops only if no newer preview took its place. */
	fun hidden(left: CameraPreview) {
		if (preview !== left) return
		preview = null
		close()
	}

	/** Opens the camera once its preview is shown and the person allowed it; called again when the answer comes. */
	@SuppressLint("MissingPermission")
	fun open() {
		val shown = preview ?: return
		if (device != null || opening || closing || activity.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) return
		val id = cameraFacing(facing) ?: return
		val opened = generation
		opening = true
		manager.openCamera(id, object : CameraDevice.StateCallback() {
			override fun onOpened(camera: CameraDevice) {
				opening = false
				if (opened != generation || preview !== shown) return camera.close()
				device = camera
				startSession(camera, shown, opened)
			}
			override fun onClosed(camera: CameraDevice) {
				closing = false
				if (preview != null && device == null) open()
			}
			override fun onDisconnected(camera: CameraDevice) {
				opening = false
				camera.close()
				if (opened == generation) close()
			}
			override fun onError(camera: CameraDevice, error: Int) {
				opening = false
				camera.close()
				if (opened == generation) close()
			}
		}, main)
	}

	private fun startSession(camera: CameraDevice, shown: CameraPreview, opened: Int) {
		if (opened != generation) return
		val texture = shown.texture.surfaceTexture
		if (texture == null) {
			shown.texture.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
				override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) = startSession(camera, shown, opened)
				override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {}
				override fun onSurfaceTextureDestroyed(surface: SurfaceTexture) = true
				override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {}
			}
			return
		}
		val surface = Surface(texture)
		val jpeg = ImageReader.newInstance(640, 480, ImageFormat.JPEG, 2)
		reader = jpeg
		jpeg.setOnImageAvailableListener({ r ->
			val image = r.acquireLatestImage() ?: return@setOnImageAvailableListener
			val bytes = image.planes[0].buffer.let { b -> ByteArray(b.remaining()).also(b::get) }
			val (w, h) = image.width to image.height
			image.close()
			capturing?.let { answer ->
				capturing = null
				answer(savePhoto(activity, bytes, w, h))
			}
		}, main)
		try {
			@Suppress("DEPRECATION")
			camera.createCaptureSession(listOf(surface, jpeg.surface), object : CameraCaptureSession.StateCallback() {
				override fun onConfigured(configured: CameraCaptureSession) {
					if (opened != generation) return configured.close()
					try {
						session = configured
						val request = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply { addTarget(surface) }.build()
						configured.setRepeatingRequest(request, null, main)
						setReady(true)
					} catch (_: Exception) {
						close()
					}
				}
				override fun onConfigureFailed(failed: CameraCaptureSession) = close()
			}, main)
		} catch (_: Exception) {
			// The camera went away between opening and configuring (its preview left the screen): start over when shown.
			close()
		}
	}

	private fun close() {
		generation++
		session?.close(); session = null
		device?.let { closing = true; it.close() }
		device = null
		reader?.close(); reader = null
		setReady(false)
	}

	private fun setReady(now: Boolean) {
		if (now == ready) return
		ready = now
		changed("ready", JsValue.Bool(now))
		if (now) {
			val waiting = waitingForReady
			waitingForReady = ArrayList()
			for (resume in waiting) resume()
		}
	}

	/** A writable field: a camera this device does not have snaps `facing` back to the one in use. */
	fun setFacing(wanted: String) {
		if (cameraFacing(wanted) == null) {
			changed("facing", JsValue.Str(facing))
			return
		}
		facing = wanted
		if (device != null) {
			close()
			open()
		}
	}

	/** The photo from this camera's own session, once it is ready: written to a file, answered as `{ url, width, height }`. */
	fun takePhoto(answer: (DeviceOutcome) -> Unit) {
		val camera = device
		val target = reader
		val running = session
		if (!ready || camera == null || target == null || running == null) {
			waitingForReady.add { takePhoto(answer) }
			return
		}
		capturing = answer
		running.capture(camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE).apply { addTarget(target.surface) }.build(), null, main)
	}
}

/** Writes photo bytes where the app can show them and answers `{ url, width, height }`. */
fun savePhoto(context: Context, bytes: ByteArray, width: Int, height: Int): DeviceOutcome {
	val file = File(context.cacheDir, "markless-photo-${System.nanoTime()}.jpg")
	file.writeBytes(bytes)
	return DeviceOutcome.Value(JsValue.Obj(linkedMapOf(
		"url" to JsValue.Str(file.toURI().toString()), "width" to JsValue.Num(width.toDouble()), "height" to JsValue.Num(height.toDouble()),
	)))
}

