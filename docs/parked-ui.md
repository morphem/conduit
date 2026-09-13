# Parked UI work (morph fork)

Things the owner asked for and we agreed to keep for later. Each entry states what and why, so a
future session does not have to reconstruct the intent.

## 1. Slash-command button in the composer

**What:** a button (e.g. a small hamburger/menu icon) beside the composer that opens the command
list — the same list `CommandMenu.svelte` already shows when the user types `/` — so a command can be
run without typing a slash. Each row should carry the command's description and where it comes from
(OpenCode built-in / server / skill / project).

**Why:** on a phone, typing `/` and a partial name is slow, and the owner does not remember the
names. This is the "few commands I actually use" shortcut.

**Open question to verify:** whether OpenCode can execute a command both from the slash menu and
"directly" (i.e. programmatically via the API), and how the command's help/source is exposed. The
relay currently logs `Failed to discover OpenCode commands; falling back to Claude commands` — so
command discovery itself needs a look against the installed server version.

## 2. Composer layout is chaotic on a phone

**What:** the bottom row currently splits controls left/right with no obvious logic:
`+  mic  Build` on the left, and `model  variant(max)  Full access  send  [stop]` on the right.
Problems the owner named:
- the primary action (send) is not the rightmost control when Stop is showing (the square sits to
  its right);
- input actions (`+`, mic) sit next to an agent **mode** selector (`Build`), which is a setting, not
  an input;
- too many small chips in one row; hard to aim on a phone.

**Proposed direction:** group by function and make the primary action unambiguous:
- left = inputs: `+` (attach) and mic;
- right = settings cluster: agent + model + variant + permission (possibly collapsed into one chip
  that opens a sheet);
- the rightmost slot is always the action: **Send** when idle, **Stop** while processing (same
  position, mutually exclusive) — never "send then another button".

## 3. Bigger record/mic button

**What:** enlarge the Huginn microphone target so it is hard to miss on a phone; the owner reports
missing it because everything in the row is small. Check the whole composer against a minimum 44 px
touch target.

## 4. Video attachments

**What:** allow attaching a video (e.g. a screen recording of an Android UI glitch), not only
images. Needs: a size/format policy, client-side handling (OpenCode's file-part input), and probably
sharing with the same "insert into composer" flow as images.

**Note (workflow, not code):** to capture an Android glitch today, use the built-in screen recorder
(Quick Settings → Screen record) or `adb shell screenrecord`, then attach the MP4 once video input
is supported. This is also relevant to the Ulam project.

## 5. Session switching for many projects/sessions

**What:** the owner runs ~10 projects, usually one main development session each (sometimes a small
feature session), max ~2-3 sessions per project. Wanted: quick switching **between projects**, plus
pinning/favourites, unread markers, and search by title.

**Also:** hide subagent sessions (`@explore subagent`, etc.) by default — Conduit already has a
`hideSubagentSessions` toggle; it should be on, and clearly discoverable.

## 6. Session cost seems to show the wrong session

The composer's new `Σ $…` line showed `$0.99` from the OpenCode TUI for the working session, then
`$0.2243` in Conduit for the same project. Verify which session Conduit treats as "active" and that
the cost is the active session's (open question raised 2026-09-11; not yet checked).
