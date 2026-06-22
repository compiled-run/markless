import AppKit
import XCTest
@testable import ArcadeDesktopProof

final class ArcadeDesktopProofTests: XCTestCase {
	@MainActor
	func testNativeButtonActivationRunsJavaScriptCoreSymbol() throws {
		_ = NSApplication.shared
		let artifact = try ArcadeDesktopProofResources.loadArtifact()
		let runtime = try ArcadeDesktopRuntime(artifact: artifact)

		let root = try runtime.mount()

		XCTAssertTrue(root is NSStackView)
		XCTAssertEqual(try runtime.textValue(hostNodeId: "host:title"), "Arcade macOS Proof")
		XCTAssertEqual(try runtime.textValue(hostNodeId: "host:buttonText"), "Count 0")
		XCTAssertEqual(runtime.graphNumber("state:count"), 0)

		try runtime.activate(hostNodeId: "host:button")

		XCTAssertEqual(runtime.graphNumber("state:count"), 1)
		XCTAssertEqual(try runtime.textValue(hostNodeId: "host:buttonText"), "Count 1")
	}
}
