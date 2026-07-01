import AppKit
import XCTest
@testable import MarklessDesktopProof

final class MarklessDesktopProofTests: XCTestCase {
	@MainActor
	func testNativeButtonActivationRunsJavaScriptCoreSymbol() throws {
		_ = NSApplication.shared
		let artifact = try MarklessDesktopProofResources.loadArtifact()
		let runtime = try MarklessDesktopRuntime(artifact: artifact)

		let root = try runtime.mount()

		XCTAssertTrue(root is NSStackView)
		XCTAssertEqual(try runtime.textValue(hostNodeId: "host:title"), "Markless macOS Proof")
		XCTAssertEqual(try runtime.textValue(hostNodeId: "host:buttonText"), "Count 0")
		XCTAssertEqual(runtime.graphNumber("state:count"), 0)

		try runtime.activate(hostNodeId: "host:button")

		XCTAssertEqual(runtime.graphNumber("state:count"), 1)
		XCTAssertEqual(try runtime.textValue(hostNodeId: "host:buttonText"), "Count 1")
	}
}
