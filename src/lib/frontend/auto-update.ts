// ─── Auto Update ─────────────────────────────────────────────────────────────
// Every build replaces the hashed entry asset, but a browser that keeps an old
// document keeps running old code with no signal — which is how a fixed composer
// stayed under the keyboard until someone happened to hard-reload. Poll the
// served shell and reload when the entry asset changes.
//
// Safe: it fetches the same document the browser already has (cache-busted) and
// reloads only when the module src differs from this document's.

const CHECK_MS = 30_000;

function currentEntry(): string | null {
	const script = document.querySelector('script[type="module"]');
	return script?.getAttribute("src") ?? null;
}

async function checkForUpdate(): Promise<void> {
	const current = currentEntry();
	if (!current) return;
	try {
		const res = await fetch(`${location.pathname}?__update=${Date.now()}`, {
			cache: "no-store",
		});
		if (!res.ok) return;
		const html = await res.text();
		// The entry module the served shell points at (ignore preloaded chunks).
		const match = /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(html);
		if (match && match[1] !== current) {
			location.reload();
		}
	} catch {
		// offline or transient — try again on the next tick
	}
}

export function initAutoUpdate(): void {
	setInterval(() => void checkForUpdate(), CHECK_MS);
	// Coming back to the app is the moment an update matters most.
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") void checkForUpdate();
	});
}
