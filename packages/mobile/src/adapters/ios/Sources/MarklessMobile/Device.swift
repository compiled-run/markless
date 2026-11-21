#if canImport(UIKit)
import AVFoundation
import CoreLocation
import Foundation
import LinkPresentation
import MarklessCore
import Network
import UIKit

/// How a device call ended: its value, or an error by name (`NotAllowedError` when the person refused).
public enum DeviceOutcome {
	case value(NativeValue)
	case error(name: String, message: String)
}

/// The device features a payload names (`@markless/serializer/native-device` lists them). A host throws on any name its
/// device does not implement, so a payload is never half run.
@MainActor
public protocol NativeDevice: AnyObject {
	/// The live value `name` now (`network.online`), of `object` when it is a device object's field (`camera.ready`).
	func read(_ name: String, object: String?) throws -> NativeValue
	/// Calls `changed` with each new value of `name` (of `object`).
	func watch(_ name: String, object: String?, _ changed: @escaping @MainActor (NativeValue) -> Void) throws
	/// Runs the call `name`, on `object` when it names one; `settle`, when given, receives how it ended.
	func call(_ name: String, object: String?, _ arguments: [NativeValue], settle: (@MainActor (DeviceOutcome) -> Void)?) throws
	/// The view that shows a device object (a camera's preview). It runs while it is in a window and releases the device
	/// when it leaves one.
	func view(for object: String, device: String) throws -> UIView
	/// The device object's owner left the screen: stop it (a recorder keeps no clip) and reset its fields.
	func release(_ object: String)
}

/// A camera's picture: an `AVCaptureVideoPreviewLayer`. Its session runs while the view is in a window.
public final class CameraPreviewView: UIView {
	public override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
	public var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
	/// Called with true when the view enters a window and false when it leaves one.
	public var onWindow: ((Bool) -> Void)?

	public override func didMoveToWindow() {
		super.didMoveToWindow()
		onWindow?(window != nil)
	}
}

/// One camera object: its session, the camera it uses, and its live fields.
@MainActor
final class CameraObject: NSObject, AVCapturePhotoCaptureDelegate {
	let session = AVCaptureSession()
	private let output = AVCapturePhotoOutput()
	private(set) var ready = false
	private(set) var facing = "back"
	var changed: (_ field: String, _ value: NativeValue) -> Void = { _, _ in }
	private var waitingForReady: [() -> Void] = []
	private var capturing: [(DeviceOutcome) -> Void] = []

	/// Asks for the camera when needed, then runs the session; with no camera on this device it never becomes ready.
	func start() {
		AVCaptureDevice.requestAccess(for: .video) { granted in
			Task { @MainActor in
				self.changed("access", .string(cameraAccess()))
				guard granted else { return }
				self.configure()
				let session = self.session
				DispatchQueue.global(qos: .userInitiated).async {
					session.startRunning()
					let running = session.isRunning
					Task { @MainActor in self.setReady(running) }
				}
			}
		}
	}

	func release() {
		let session = self.session
		DispatchQueue.global(qos: .userInitiated).async { session.stopRunning() }
		setReady(false)
	}

	private func setReady(_ now: Bool) {
		guard now != ready else { return }
		ready = now
		changed("ready", .bool(now))
		if now {
			let waiting = waitingForReady
			waitingForReady = []
			for resume in waiting { resume() }
		}
	}

	private func configure() {
		session.beginConfiguration()
		defer { session.commitConfiguration() }
		for input in session.inputs { session.removeInput(input) }
		let position: AVCaptureDevice.Position = facing == "front" ? .front : .back
		guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
			let input = try? AVCaptureDeviceInput(device: camera), session.canAddInput(input)
		else { return }
		session.addInput(input)
		if session.outputs.isEmpty, session.canAddOutput(output) { session.addOutput(output) }
	}

	/// A writable field: `facing`. A camera this device does not have snaps the field back to the one in use.
	func set(facing wanted: String) {
		let position: AVCaptureDevice.Position = wanted == "front" ? .front : .back
		if AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position) == nil {
			changed("facing", .string(facing))
			return
		}
		facing = wanted
		configure()
	}

	/// The photo from this camera's own session, once it is ready: written to a file, answered as `{ url, width, height }`.
	func takePhoto(_ answer: @escaping (DeviceOutcome) -> Void) {
		if cameraRefused() { return answer(.error(name: "NotAllowedError", message: "The camera was refused")) }
		guard ready else {
			waitingForReady.append { [weak self] in self?.takePhoto(answer) }
			return
		}
		capturing.append(answer)
		output.capturePhoto(with: AVCapturePhotoSettings(), delegate: self)
	}

	nonisolated func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
		let data = photo.fileDataRepresentation()
		let message = error?.localizedDescription
		Task { @MainActor in
			guard !self.capturing.isEmpty else { return }
			let answer = self.capturing.removeFirst()
			guard let data, let image = UIImage(data: data) else {
				return answer(.error(name: "Error", message: message ?? "The camera gave no photo"))
			}
			answer(savePhoto(data, size: image.size))
		}
	}
}

/// Writes photo bytes where the app can show them and answers `{ url, width, height }`.
public func savePhoto(_ data: Data, size: CGSize) -> DeviceOutcome {
	let url = FileManager.default.temporaryDirectory.appending(path: "markless-photo-\(UUID().uuidString).jpg")
	do {
		try data.write(to: url)
	} catch {
		return .error(name: "Error", message: "\(error)")
	}
	return .value(.object([
		("url", .string(url.absoluteString)), ("width", .number(Double(size.width))), ("height", .number(Double(size.height))),
	]))
}

/// Whether the person (or a device policy) has refused the camera.
public func cameraRefused() -> Bool {
	[.denied, .restricted].contains(AVCaptureDevice.authorizationStatus(for: .video))
}

private func cameraAccess() -> String {
	switch AVCaptureDevice.authorizationStatus(for: .video) {
	case .notDetermined: return "unknown"
	case .restricted: return "blocked"
	case .denied: return "denied"
	default: return "granted"
	}
}

/// One recorder object: an `AVAudioRecorder` writing a temporary AAC file while `active`.
@MainActor
final class RecorderObject {
	private var recorder: AVAudioRecorder?
	private var timer: Timer?
	private var wanted = false
	private(set) var seconds = 0
	private(set) var clip: NativeValue = .null
	var changed: (_ field: String, _ value: NativeValue) -> Void = { _, _ in }

	var active: Bool { recorder != nil }

	/// A writable field: `active`. Asks for the microphone when needed; a refusal or a failed start snaps it back to false.
	func set(active now: Bool) {
		wanted = now
		guard now else { return stop(keep: true) }
		guard recorder == nil else { return }
		switch AVAudioApplication.shared.recordPermission {
		case .granted: start()
		case .undetermined:
			Task {
				let granted = await AVAudioApplication.requestRecordPermission()
				self.changed("access", .string(recorderAccess()))
				if !granted { return self.changed("active", .bool(false)) }
				if self.wanted, self.recorder == nil { self.start() }
			}
		default: changed("active", .bool(false))
		}
	}

	private func start() {
		let url = FileManager.default.temporaryDirectory.appending(path: "markless-clip-\(UUID().uuidString).m4a")
		let settings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44_100, AVNumberOfChannelsKey: 1]
		do {
			let session = AVAudioSession.sharedInstance()
			try session.setCategory(.playAndRecord, options: [.defaultToSpeaker])
			try session.setActive(true)
			let made = try AVAudioRecorder(url: url, settings: settings)
			guard made.record() else { return changed("active", .bool(false)) }
			recorder = made
		} catch {
			return changed("active", .bool(false))
		}
		seconds = 0
		changed("active", .bool(true))
		changed("seconds", .number(0))
		timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
			MainActor.assumeIsolated {
				guard let self, self.recorder != nil else { return }
				self.seconds += 1
				self.changed("seconds", .number(Double(self.seconds)))
			}
		}
	}

	/// Stops recording; with `keep`, `clip` becomes the file's URL, otherwise the file is deleted.
	private func stop(keep: Bool) {
		timer?.invalidate()
		timer = nil
		guard let recorder else { return }
		self.recorder = nil
		recorder.stop()
		try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
		if keep {
			clip = .string(recorder.url.absoluteString)
			changed("clip", clip)
		} else {
			recorder.deleteRecording()
		}
	}

	func release() {
		wanted = false
		stop(keep: false)
		seconds = 0
		clip = .null
		changed("active", .bool(false))
		changed("seconds", .number(0))
		changed("clip", .null)
	}
}

private func recorderAccess() -> String {
	switch AVAudioApplication.shared.recordPermission {
	case .undetermined: return "unknown"
	case .denied: return "denied"
	default: return "granted"
	}
}

/// Gives the share sheet the link and its title, so the sheet's header shows the title.
final class ShareItem: NSObject, UIActivityItemSource {
	let url: URL
	let title: String?

	init(url: URL, title: String?) {
		self.url = url
		self.title = title
	}

	func activityViewControllerPlaceholderItem(_ controller: UIActivityViewController) -> Any { url }

	func activityViewController(_ controller: UIActivityViewController, itemForActivityType type: UIActivity.ActivityType?) -> Any? { url }

	func activityViewControllerLinkMetadata(_ controller: UIActivityViewController) -> LPLinkMetadata? {
		let metadata = LPLinkMetadata()
		metadata.originalURL = url
		metadata.url = url
		metadata.title = title
		return metadata
	}
}

/// The phone's own features.
@MainActor
public final class PlatformDevice: NSObject, NativeDevice, CLLocationManagerDelegate {
	private let path = NWPathMonitor()
	private var online: Bool
	private var watchers: [String: [@MainActor (NativeValue) -> Void]] = [:]
	private lazy var locations = CLLocationManager()
	private var waitingForAccess: [@MainActor () -> Void] = []
	private var waitingForPosition: [@MainActor (DeviceOutcome) -> Void] = []
	private var cameras: [String: CameraObject] = [:]
	private var recorders: [String: RecorderObject] = [:]

	public override init() {
		online = path.currentPath.status == .satisfied
		super.init()
		path.pathUpdateHandler = { [weak self] update in
			let satisfied = update.status == .satisfied
			Task { @MainActor in self?.set("network.online", .bool(satisfied)) }
		}
		path.start(queue: .main)
	}

	private func key(_ name: String, _ object: String?) -> String { object.map { "\($0)#\(name)" } ?? name }

	private func camera(_ object: String) -> CameraObject {
		if let known = cameras[object] { return known }
		let made = CameraObject()
		made.changed = { [weak self] field, value in
			self?.set(field == "access" ? "camera.access" : self?.key("camera.\(field)", object) ?? "", value)
		}
		cameras[object] = made
		return made
	}

	private func recorder(_ object: String) -> RecorderObject {
		if let known = recorders[object] { return known }
		let made = RecorderObject()
		made.changed = { [weak self] field, value in
			self?.set(field == "access" ? "recorder.access" : self?.key("recorder.\(field)", object) ?? "", value)
		}
		recorders[object] = made
		return made
	}

	public func release(_ object: String) {
		cameras[object]?.release()
		recorders[object]?.release()
	}

	public func read(_ name: String, object: String?) throws -> NativeValue {
		switch (name, object) {
		case ("network.online", nil): return .bool(online)
		case ("location.access", nil): return .string(access(locations.authorizationStatus))
		case ("camera.access", nil): return .string(cameraAccess())
		case let ("camera.ready", object?): return .bool(camera(object).ready)
		case let ("camera.facing", object?): return .string(camera(object).facing)
		case ("recorder.access", nil): return .string(recorderAccess())
		case let ("recorder.active", object?): return .bool(recorder(object).active)
		case let ("recorder.seconds", object?): return .number(Double(recorder(object).seconds))
		case let ("recorder.clip", object?): return recorder(object).clip
		default: throw HostError("this device has no live value \(name)")
		}
	}

	public func watch(_ name: String, object: String?, _ changed: @escaping @MainActor (NativeValue) -> Void) throws {
		_ = try read(name, object: object)
		if name == "location.access" { locations.delegate = self }
		watchers[key(name, object), default: []].append(changed)
	}

	private func set(_ key: String, _ value: NativeValue) {
		if key == "network.online", case let .bool(now) = value {
			guard now != online else { return }
			online = now
		}
		for changed in watchers[key] ?? [] { changed(value) }
	}

	public func view(for object: String, device: String) throws -> UIView {
		guard device == "camera" else { throw HostError("this device has no view for a \(device)") }
		let camera = camera(object)
		let view = CameraPreviewView()
		view.previewLayer.session = camera.session
		view.previewLayer.videoGravity = .resizeAspectFill
		view.onWindow = { inWindow in if inWindow { camera.start() } else { camera.release() } }
		return view
	}

	public func call(_ name: String, object: String?, _ arguments: [NativeValue], settle: (@MainActor (DeviceOutcome) -> Void)?) throws {
		switch (name, object) {
		case ("haptics.tap", nil):
			UIImpactFeedbackGenerator(style: .light).impactOccurred()
			settle?(.value(.null))
		case let ("camera.takePhoto", object?):
			camera(object).takePhoto { outcome in settle?(outcome) }
		case let ("camera.facing", object?):
			guard case let .string(wanted)? = arguments.first else { throw HostError("camera.facing takes one string") }
			camera(object).set(facing: wanted)
		case let ("recorder.active", object?):
			guard case let .bool(now)? = arguments.first else { throw HostError("recorder.active takes one boolean") }
			recorder(object).set(active: now)
		case ("sharesheet.open", nil):
			guard case let .object(fields)? = arguments.first, case let .string(link)? = fields.get("url"), let url = URL(string: link) else {
				throw HostError("sharesheet.open takes { title?, url }")
			}
			let title: String? = if case let .string(text)? = fields.get("title") { text } else { nil }
			share(ShareItem(url: url, title: title)) { settle?($0) }
		case ("browser.open", nil):
			guard case let .string(link)? = arguments.first, let url = URL(string: link) else { throw HostError("browser.open needs a URL") }
			UIApplication.shared.open(url)
			settle?(.value(.null))
		case ("settings.open", nil):
			guard let url = URL(string: UIApplication.openSettingsURLString) else { throw HostError("this device has no Settings link") }
			UIApplication.shared.open(url)
			settle?(.value(.null))
		case ("location.current", nil):
			let answer = settle ?? { _ in }
			locations.delegate = self
			switch locations.authorizationStatus {
			case .denied, .restricted:
				answer(.error(name: "NotAllowedError", message: "Location was refused"))
			case .notDetermined:
				waitingForAccess.append { [weak self] in self?.locate(answer) }
				locations.requestWhenInUseAuthorization()
			default:
				locate(answer)
			}
		default:
			throw HostError("this device has no call \(name)")
		}
	}

	/// Shows the share sheet over the key window's top-most screen; answers null once it closes, shared or not.
	private func share(_ item: ShareItem, _ answer: @escaping @MainActor (DeviceOutcome) -> Void) {
		let window = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first(where: \.isKeyWindow)
		guard var top = window?.rootViewController else { return answer(.error(name: "Error", message: "There is no screen to show the share sheet on")) }
		while let presented = top.presentedViewController { top = presented }
		let sheet = UIActivityViewController(activityItems: [item], applicationActivities: nil)
		sheet.completionWithItemsHandler = { _, _, _, _ in answer(.value(.null)) }
		if let popover = sheet.popoverPresentationController {
			popover.sourceView = top.view
			popover.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.midY, width: 0, height: 0)
		}
		top.present(sheet, animated: true)
	}

	private func locate(_ answer: @escaping @MainActor (DeviceOutcome) -> Void) {
		switch locations.authorizationStatus {
		case .denied, .restricted: answer(.error(name: "NotAllowedError", message: "Location was refused"))
		default:
			waitingForPosition.append(answer)
			locations.requestLocation()
		}
	}

	private func access(_ status: CLAuthorizationStatus) -> String {
		switch status {
		case .notDetermined: return "unknown"
		case .restricted: return "blocked"
		case .denied: return "denied"
		default: return locations.accuracyAuthorization == .reducedAccuracy ? "limited" : "granted"
		}
	}

	public nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
		Task { @MainActor in
			self.set("location.access", .string(self.access(self.locations.authorizationStatus)))
			if self.locations.authorizationStatus == .notDetermined { return }
			let waiting = self.waitingForAccess
			self.waitingForAccess = []
			for resume in waiting { resume() }
		}
	}

	public nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations updates: [CLLocation]) {
		guard let last = updates.last else { return }
		let position = NativeValue.object([
			("latitude", .number(last.coordinate.latitude)), ("longitude", .number(last.coordinate.longitude)),
			("accuracy", .number(last.horizontalAccuracy)),
		])
		Task { @MainActor in self.answerPosition(.value(position)) }
	}

	public nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
		let refused = (error as? CLError)?.code == .denied
		let message = error.localizedDescription
		Task { @MainActor in
			self.answerPosition(refused ? .error(name: "NotAllowedError", message: "Location was refused") : .error(name: "Error", message: message))
		}
	}

	private func answerPosition(_ outcome: DeviceOutcome) {
		let waiting = waitingForPosition
		waitingForPosition = []
		for answer in waiting { answer(outcome) }
	}
}
#endif
