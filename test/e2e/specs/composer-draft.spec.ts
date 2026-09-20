import { expect, test } from "@playwright/test";
import { initMessages } from "../fixtures/mockup-state.js";
import { mockWsRpc } from "../helpers/rpc-mock.js";
import { mockRelayWebSocket } from "../helpers/ws-mock.js";

test("@composer-draft restores an unsent draft after a page reload", async ({
	page,
}) => {
	const messagesWithStaleDraft = initMessages.map((message) =>
		message.type === "session_switched"
			? { ...message, inputText: "Older server draft" }
			: message,
	);
	await mockRelayWebSocket(page, {
		initMessages: messagesWithStaleDraft,
		responses: new Map(),
	});
	await mockWsRpc(page, {
		handlers: {
			GetProjects: async () => ({
				projects: [{ slug: "myapp", name: "myapp", path: "/tmp/myapp" }],
			}),
		},
	});

	await page.goto("/p/myapp/");
	const textarea = page.locator("#input");
	await textarea.waitFor({ state: "visible", timeout: 20_000 });
	await textarea.fill("Keep this draft through mobile resume");

	await page.reload();

	await expect(page.locator("#input")).toHaveValue(
		"Keep this draft through mobile resume",
	);
});
