import AppKit
import Foundation

@main
final class MarklessDesktopProofDemo: NSObject, NSApplicationDelegate {
	private var desktopFrame: NSWindow?
	private var runtime: MarklessDesktopRuntime?

	static func main() {
		if CommandLine.arguments.contains("--verify-launch") {
			do {
				try verifyLaunch()
			} catch {
				fputs("MarklessDesktopProofDemo verify failed: \(error)\n", stderr)
				exit(1)
			}
			return
		}

		let app = NSApplication.shared
		let delegate = MarklessDesktopProofDemo()
		app.delegate = delegate
		app.setActivationPolicy(.regular)
		app.run()
	}

	func applicationDidFinishLaunching(_ notification: Notification) {
		do {
			let artifact = try MarklessDesktopProofResources.loadArtifact()
			let runtime = try MarklessDesktopRuntime(artifact: artifact)
			let root = try runtime.mount()
			root.translatesAutoresizingMaskIntoConstraints = false

			let frame = NSWindow(
				contentRect: NSRect(x: 0, y: 0, width: 360, height: 220),
				styleMask: [.titled, .closable, .miniaturizable, .resizable],
				backing: .buffered,
				defer: false,
			)
			frame.title = "Markless macOS Proof"
			frame.contentView = root
			frame.center()
			frame.makeKeyAndOrderFront(nil)
			NSApp.activate(ignoringOtherApps: true)

			self.runtime = runtime
			self.desktopFrame = frame
		} catch {
			let alert = NSAlert(error: error)
			alert.runModal()
			NSApplication.shared.terminate(nil)
		}
	}

	@MainActor
	private static func verifyLaunch() throws {
		_ = NSApplication.shared
		let artifact = try MarklessDesktopProofResources.loadArtifact()
		let runtime = try MarklessDesktopRuntime(artifact: artifact)
		let root = try runtime.mount()

		guard root is NSStackView else {
			throw VerificationError.unexpectedRoot
		}
		guard try runtime.textValue(hostNodeId: "host:title") == "Markless macOS Proof" else {
			throw VerificationError.unexpectedTitle
		}
		guard try runtime.textValue(hostNodeId: "host:buttonText") == "Count 0" else {
			throw VerificationError.unexpectedInitialText
		}

		try runtime.activate(hostNodeId: "host:button")

		guard runtime.graphNumber("state:count") == 1 else {
			throw VerificationError.unexpectedGraphValue
		}
		guard try runtime.textValue(hostNodeId: "host:buttonText") == "Count 1" else {
			throw VerificationError.unexpectedUpdatedText
		}

		print("{\"launchStatus\":\"verified\",\"title\":\"Markless macOS Proof\",\"buttonText\":\"Count 1\"}")
	}

	private enum VerificationError: Error {
		case unexpectedRoot
		case unexpectedTitle
		case unexpectedInitialText
		case unexpectedGraphValue
		case unexpectedUpdatedText
	}
}
