import { expect, test } from "@playwright/test";
import { initMessages } from "../fixtures/mockup-state.js";
import { mockWsRpc } from "../helpers/rpc-mock.js";
import { mockRelayWebSocket } from "../helpers/ws-mock.js";

test("@composer-ear live listen appends heard words and shows pressed state", async ({
	page,
}) => {
	await page.addInitScript(`
		localStorage.setItem("huginn.url", "https://huginn.test");
		localStorage.setItem("huginn.key", "harness-key");
		const Native = window.WebSocket;
		window.WebSocket = function (url, protocols) {
			const u = String(url);
			if (u.includes("/api/ear")) {
				const rec = {
					url: u,
					sent: [],
					sock: {
						readyState: 1,
						onopen: null,
						onmessage: null,
						onclose: null,
						onerror: null,
						send: function (v) { rec.sent.push(v); },
						close: function () {
							if (rec.sock.onclose) rec.sock.onclose({ code: 1000 });
						},
					},
				};
				window.__ear = rec;
				queueMicrotask(function () {
					if (rec.sock.onopen) rec.sock.onopen(new Event("open"));
				});
				return rec.sock;
			}
			return new Native(url, protocols);
		};
		window.WebSocket.prototype = Native.prototype;
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: { getUserMedia: async function () { return new MediaStream(); } },
		});
	`);

	await mockRelayWebSocket(page, { initMessages, responses: new Map() });
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
	await textarea.fill("zobacz");

	const ear = page.locator("#huginn-ear");
	await expect(ear).toBeVisible();
	await expect(ear).toHaveAttribute("aria-pressed", "false");

	await ear.click();
	await expect(ear).toHaveAttribute("aria-pressed", "true");

	await expect
		.poll(async () =>
			page.evaluate(`(() => {
				const rec = window.__ear;
				if (!rec || !rec.sent.length) return false;
				const hello = JSON.parse(String(rec.sent[0]));
				return hello.type === "hello" && hello.mode === "dictate" && !!hello.key;
			})()`),
		)
		.toBe(true);

	await page.evaluate(`(() => {
		const rec = window.__ear;
		if (!rec || !rec.sock.onmessage) return;
		rec.sock.onmessage(new MessageEvent("message", {
			data: JSON.stringify({
				type: "heard",
				mode: "dictate",
				text: "tu się przyciski nie mieszczą",
				ops: [],
				parsed: null,
			}),
		}));
	})()`);

	await expect(textarea).toHaveValue("zobacz tu się przyciski nie mieszczą");

	await ear.click();
	await expect(ear).toHaveAttribute("aria-pressed", "false");
});
