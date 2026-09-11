<!-- ─── Session Cost ─────────────────────────────────────────────────────────── -->
<!-- Total cost of the CURRENT session (sum of the loaded turns' costs), shown
     persistently above the composer the way OpenCode's status bar shows it.
     Suppressed at zero, so a fresh session carries no chrome. -->

<script lang="ts">
	import { currentChat, getMessages } from "../../stores/chat.svelte.js";

	const total = $derived.by(() => {
		let sum = 0;
		for (const m of getMessages(currentChat())) {
			if (m.type === "result" && m.cost) sum += m.cost;
		}
		return sum;
	});
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
