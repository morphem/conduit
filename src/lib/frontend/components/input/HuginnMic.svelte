<!-- ─── Huginn Mic ──────────────────────────────────────────────────────────── -->
<!-- Voice capture beside the composer. Tap to record with the phone microphone,
     stop to upload the clip to a Huginn server, then insert either the raw
     transcript or its refined prompt into the composer. The refined variant is
     fetched only on demand: it costs one model call, the raw one is free. -->

<script lang="ts">
	import { onDestroy } from "svelte";

	interface Props {
		onInsert: (text: string) => void;
	}

	let { onInsert }: Props = $props();

	// ─── Settings (localStorage; configured once in the panel) ────────────────

	let huginnUrl = $state(localStorage.getItem("huginn.url") ?? "https://huginn.prawdzik.eu");
	let huginnKey = $state(localStorage.getItem("huginn.key") ?? "");
	let showSetup = $state(false);

	function saveSettings() {
		huginnUrl = huginnUrl.trim().replace(/\/+$/, "");
		localStorage.setItem("huginn.url", huginnUrl);
		localStorage.setItem("huginn.key", huginnKey.trim());
		showSetup = false;
		if (mode === "setup") {
			mode = "idle";
		}
	}

	// ─── Capture state ────────────────────────────────────────────────────────

	type Mode = "idle" | "rec" | "busy" | "ready" | "error";
	let mode: Mode = $state("idle");
	let elapsed = $state(0);
	let errorText = $state("");
	let rawText = $state("");
	let refinedText = $state("");
	let useRefined = $state(false);
	let refining = $state(false);

	let recorder: MediaRecorder | undefined;
	let stream: MediaStream | undefined;
	let chunks: Blob[] = [];
	let tickTimer: ReturnType<typeof setInterval> | undefined;

	const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm"];

	function pickMime(): string | undefined {
		for (const t of MIME_TYPES) {
			if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
		}
		return undefined;
	}

	async function start() {
		errorText = "";
		if (!huginnKey.trim()) {
			mode = "error";
			errorText = "Set your Huginn API key first.";
			showSetup = true;
			return;
		}
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const mimeType = pickMime();
			recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
			chunks = [];
			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) chunks.push(e.data);
			};
			recorder.onstop = () => {
				void finish(new Blob(chunks, { type: recorder?.mimeType ?? "audio/webm" }));
			};
			recorder.start();
			elapsed = 0;
			tickTimer = setInterval(() => (elapsed += 1), 1000);
			mode = "rec";
		} catch (err) {
			mode = "error";
			errorText = err instanceof Error ? err.message : "Microphone unavailable.";
		}
	}

	function stop() {
		if (tickTimer) clearInterval(tickTimer);
		tickTimer = undefined;
		recorder?.stop();
		stream?.getTracks().forEach((t) => {
			t.stop();
		});
		mode = "busy";
	}

	function fail(message: string) {
		mode = "error";
		errorText = message;
		reset();
	}

	// ─── Huginn calls (same contracts as huginn/voice.py) ────────────────────

	interface HuginnNote {
		id?: number;
		text?: string;
		archived_reason?: string | null;
	}

	interface HuginnJob {
		job_id?: number;
		status?: string;
		error?: string;
		note?: HuginnNote | null;
		note_id?: number;
		result_text?: string;
	}

	async function api<T>(path: string, init?: RequestInit): Promise<T> {
		const res = await fetch(`${huginnUrl}${path}`, {
			...init,
			headers: { "X-API-Key": huginnKey.trim(), ...(init?.headers ?? {}) },
		});
		if (!res.ok) throw new Error(`Huginn ${res.status} on ${path}`);
		return res.json() as Promise<T>;
	}

	async function upload(blob: Blob): Promise<number> {
		const form = new FormData();
		form.append("file", blob, "voice.webm");
		const res = await fetch(
			`${huginnUrl}/api/transcribe?${new URLSearchParams({ source: "opencode" })}`,
			{ method: "POST", body: form, headers: { "X-API-Key": huginnKey.trim() } },
		);
		if (!res.ok) throw new Error(`Huginn ${res.status} on transcribe`);
		const job = (await res.json()) as HuginnJob;
		return job.job_id as number;
	}

	async function waitForJob(jobId: number): Promise<HuginnJob> {
		const deadline = Date.now() + 120_000;
		while (Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, 1000));
			const job = await api<HuginnJob>(`/api/jobs/${jobId}`);
			if (job.status === "done") return job;
			if (job.status === "failed") throw new Error(job.error ?? "transcription failed");
		}
		throw new Error("transcription timed out");
	}

	async function fetchRefined(noteId: number): Promise<string> {
		const stored = await api<{ refinement?: { markdown?: string } | null }>(
			`/api/neuron/${noteId}/refine`,
		);
		const markdown = stored?.refinement?.markdown;
		if (markdown) return markdown;
		const made = await api<{ markdown?: string }>(`/api/neuron/${noteId}/refine`, {
			method: "POST",
			body: "{}",
			headers: { "Content-Type": "application/json" },
		});
		return made?.markdown ?? "";
	}

	async function finish(blob: Blob) {
		rawText = "";
		refinedText = "";
		useRefined = false;
		try {
			const jobId = await upload(blob);
			const job = await waitForJob(jobId);
			const note = job.note ?? {};
			noteId = note.id ?? job.note_id ?? null;
			if ((note.archived_reason ?? "") === "silent") {
				fail("The recording caught no audio. Check the microphone.");
				return;
			}
			rawText = (note.text ?? job.result_text ?? "").trim();
			if (!rawText) {
				fail("The transcript came back empty.");
				return;
			}
			mode = "ready";
		} catch (err) {
			fail(err instanceof Error ? err.message : "Transcription failed.");
		}
	}

	// ─── Derived / actions ────────────────────────────────────────────────────

	let noteId = $state<number | null>(null);

	const activeText = $derived(useRefined ? refinedText : rawText);

	async function toggleRefined() {
		useRefined = !useRefined;
		if (useRefined && !refinedText && noteId) {
			refining = true;
			try {
				refinedText = (await fetchRefined(noteId)) || "(refine came back empty)";
			} catch (err) {
				useRefined = false;
				errorText = err instanceof Error ? err.message : "Refine failed.";
			} finally {
				refining = false;
			}
		}
	}

	function insert() {
		const text = activeText.trim();
		if (text) onInsert(text);
		reset();
	}

	function reset() {
		mode = "idle";
		noteId = null;
		errorText = "";
	}

	onDestroy(() => {
		if (tickTimer) clearInterval(tickTimer);
		stream?.getTracks().forEach((t) => {
			t.stop();
		});
	});
</script>

{#if mode === "ready" || mode === "error"}
	<div id="huginn-panel" class="relative w-full max-w-[760px] mx-auto px-4 pb-1">
		<div class="rounded-xl border border-border bg-bg-alt px-3 py-2 text-sm">
			{#if mode === "error"}
				<div class="text-warning">{errorText}</div>
			{:else}
				<div class="flex items-center gap-2 mb-1">
					<button
						type="button"
						class="rounded-full px-2 py-0.5 border text-xs transition-colors {useRefined
							? 'border-border text-text-muted'
							: 'border-brand-a text-brand-a'}"
						onclick={() => (useRefined = false)}
					>
						raw
					</button>
					<button
						type="button"
						class="rounded-full px-2 py-0.5 border text-xs transition-colors flex items-center gap-1 {useRefined
							? 'border-brand-a text-brand-a'
							: 'border-border text-text-muted'}"
						onclick={toggleRefined}
					>
						refined {#if refining}<span class="animate-spin">◌</span>{/if}
					</button>
					<span class="text-xs text-text-muted truncate flex-1">{activeText.slice(0, 80)}</span>
				</div>
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="rounded-lg px-3 py-1 bg-brand-a text-white text-sm font-medium"
						onclick={insert}
					>
						Insert
					</button>
					<button
						type="button"
						class="rounded-lg px-3 py-1 border border-border text-sm text-text-muted"
						onclick={reset}
					>
						Discard
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

{#if showSetup}
	<div id="huginn-setup" class="relative w-full max-w-[760px] mx-auto px-4 pb-1">
		<div class="rounded-xl border border-border bg-bg-alt px-3 py-2 text-sm space-y-1">
			<div class="font-medium">Huginn server</div>
			<input
				class="w-full rounded-lg border border-border bg-transparent px-2 py-1"
				bind:value={huginnUrl}
				placeholder="https://huginn.prawdzik.eu"
			/>
			<input
				class="w-full rounded-lg border border-border bg-transparent px-2 py-1"
				bind:value={huginnKey}
				placeholder="API key (named user key)"
				type="password"
			/>
			<div class="flex gap-2 pt-1">
				<button type="button" class="rounded-lg px-3 py-1 bg-brand-a text-white" onclick={saveSettings}>
					Save
				</button>
				<button
					type="button"
					class="rounded-lg px-3 py-1 border border-border text-text-muted"
					onclick={() => (showSetup = false)}
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}

<div id="huginn-mic-wrap">
	<button
		id="huginn-mic"
		type="button"
		class="shrink-0 w-8 h-8 rounded-[10px] border border-border text-text-muted cursor-pointer flex items-center justify-center transition-[background,color,border-color] duration-150 touch-manipulation hover:bg-bg-alt hover:text-text active:opacity-70 disabled:opacity-25 disabled:cursor-default {mode ===
		'rec'
			? 'bg-red-500/15 border-red-500/60 text-red-400'
			: ''}"
		disabled={mode === "busy"}
		title={mode === "rec" ? `Stop (${elapsed}s)` : mode === "busy" ? "Transcribing…" : "Record with Huginn"}
		onclick={() => (mode === "rec" ? stop() : start())}
	>
		{#if mode === "rec"}
			<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
				<rect x="6" y="6" width="12" height="12" rx="2" />
			</svg>
		{:else if mode === "busy"}
			<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" class="animate-spin">
				<path d="M21 12a9 9 0 1 1-6.2-8.56" />
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
				<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
				<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
				<line x1="12" x2="12" y1="19" y2="22" />
			</svg>
		{/if}
	</button>
</div>
