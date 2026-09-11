<!-- ─── Session Cost ─────────────────────────────────────────────────────────── -->
<!-- Total cost of the CURRENT session, shown persistently above the composer the
     way OpenCode's status bar shows it. The value comes from the OpenCode
     session's own cumulative `cost` (re-sent after every turn), so it covers the
     whole session from the start — not just the messages the client has paged
     in. Falls back to the sum of the loaded turns when a session carries no cost
     yet. Suppressed at zero, so a fresh session carries no chrome. -->

<script lang="ts">
	import { currentChat, getMessages } from "../../stores/chat.svelte.js";
	import { getActiveSession } from "../../stores/session.svelte.js";

	const loadedSum = $derived.by(() => {
		let sum = 0;
		for (const m of getMessages(currentChat())) {
			if (m.type === "result" && m.cost) sum += m.cost;
		}
		return sum;
	});

	const total = $derived(getActiveSession()?.cost ?? loadedSum);
</script>

{#if total > 0}
	<div
		id="session-cost"
		class="flex justify-end px-2 pb-1 font-mono text-xs text-text-dimmer whitespace-nowrap"
		title="Total cost of this session"
	>
		Σ ${total.toFixed(4)}
	</div>
{/if}
