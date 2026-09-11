import { describe, expect, it } from "vitest";
import { decodeOpenCodeSessionListResponse } from "../../src/lib/contracts/providers/opencode-sdk.js";
import { toSessionInfoList } from "../../src/lib/session/session-info-list.js";

// The OpenCode API returns the session's cumulative `cost`, but the SDK type omits
// it. Effect's Schema.Struct STRIPS unknown fields on decode, so unless the field
// is in the schema the value never reaches SessionInfo and the UI silently falls
// back to summing only the turns it has paged in. This pins it end to end.
describe("session cost", () => {
	it("survives decode and reaches SessionInfo", () => {
		const raw = [
			{
				id: "s1",
				projectID: "p",
				directory: "/x",
				title: "t",
				version: "1.18.30",
				time: { created: 1, updated: 2 },
				cost: 0.99,
			},
		];
		const decoded = decodeOpenCodeSessionListResponse(raw) as unknown as Array<
			Record<string, unknown>
		>;
		expect(decoded[0]?.cost).toBe(0.99);

		const infos = toSessionInfoList(decoded as never);
		expect(infos[0]?.cost).toBe(0.99);
	});
});
