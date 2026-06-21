import UIKit
import XCTest
@testable import ArcadeNativeProof

final class ArcadeNativeProofTests: XCTestCase {
	@MainActor
	func testNativeButtonActivationRunsJavaScriptCoreSymbol() throws {
		let artifact = try ArcadeNativeProofResources.loadArtifact()
		let runtime = try ArcadeNativeRuntime(artifact: artifact)

		let root = try runtime.mount()

		XCTAssertTrue(root is UIStackView)
		XCTAssertEqual(try runtime.textValue(hostNodeId: "host:title"), "Arcade iOS Proof")
		XCTAssertEqual(try runtime.textValue(hostNodeId: "host:buttonText"), "Count 0")
		XCTAssertEqual(runtime.graphNumber("state:count"), 0)

		try runtime.activate(hostNodeId: "host:button")

		XCTAssertEqual(runtime.graphNumber("state:count"), 1)
		XCTAssertEqual(try runtime.textValue(hostNodeId: "host:buttonText"), "Count 1")
	}
}
