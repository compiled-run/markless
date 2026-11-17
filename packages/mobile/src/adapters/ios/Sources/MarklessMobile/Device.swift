#if canImport(UIKit)
import AVFoundation
import CoreLocation
import Foundation
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

private func cameraAccess() -> String {
	switch AVCaptureDevice.authorizationStatus(for: .video) {
	case .notDetermined: return "unknown"
	case .restricted: return "blocked"
	case .denied: return "denied"
	default: return "granted"
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

	public func read(_ name: String, object: String?) throws -> NativeValue {
		switch (name, object) {
		case ("network.online", nil): return .bool(online)
		case ("location.access", nil): return .string(access(locations.authorizationStatus))
		case ("camera.access", nil): return .string(cameraAccess())
		case let ("camera.ready", object?): return .bool(camera(object).ready)
		case let ("camera.facing", object?): return .string(camera(object).facing)
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
