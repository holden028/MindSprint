# MindSprint product direction

## Core loop

**Capture → Do → Reflect (optional).**

MindSprint should not feel like two products (a to-do list and a Pomodoro app). Every open item is something to **do**. A timer is a tool you can pick up when it helps — not a gate between “quick” and “focus” worlds.

### Work mode is a hint, not a rule

AI may tag a task as *quick* or *focus help*. That only changes soft suggestions and copy. You can always:

- Mark done immediately
- Start working with no countdown (**Just work**)
- Optionally use a Sprint or Pomodoro timer

### Encouragement

The product should actively pull you in two directions:

1. **Do the next thing** — a clear “Do this next” surface on Today
2. **Put things into MindSprint** — capture nudges when the list is thin or empty

Empty MindSprint is not a finished state; it is a prompt to dump whatever is in your head.

---

## Optional timers

| Mode | Behavior |
|------|----------|
| **Just work** (default) | Count-up clock, no auto-end. Finish when the task is done. |
| **Sprint** | Short optional countdown (ADHD burst). |
| **Pomodoro** | Classic 25m optional countdown. |

Pomodoro stays available for people who like it. It is not the identity of the product.

---

## iPhone Focus Lock (roadmap)

**Vision:** Start a task in MindSprint on iPhone → the phone restricts itself to **Spotify + MindSprint** until that task is marked complete (or you intentionally end the lock).

### Why this matters

For ADHD / phone distraction, a soft “phone off” toggle is not enough. Real device-level restriction turns MindSprint into the work container, not another app competing with Instagram.

### Feasible approach (native iOS)

Apple’s **FamilyControls / ManagedSettings / DeviceActivity** APIs (Screen Time entitlement) can:

- Shield / block selected apps and categories
- Allowlist apps (e.g. Spotify + MindSprint)
- Tie the shield session to an active MindSprint task via the app’s own API

This requires:

1. A native iOS app (SwiftUI or React Native shell) with Screen Time entitlements from Apple
2. Backend session state: `task_id`, lock started_at, allowlist, unlock on complete / abandon
3. Clear escape hatch (end lock early with a frictionful confirm — not zero friction, not impossible)

### Near-term web / PWA steps (before App Store)

- Keep **Phone lock** as an environment commitment + reflection signal
- Guided Screen Time / Focus Mode setup deep-links (manual allowlist of Spotify + Safari→MindSprint)
- Strong “Do this next” + capture loop on mobile web so habit forms before native lock ships

### Out of scope for web-only

Browsers cannot forcibly block other iPhone apps. True lock-in is native.

---

## Success signals

- Users complete tasks without starting a timer
- Capture volume stays healthy (things keep entering MindSprint)
- Timers are used when chosen, not because the UI forced them
- (Later) Focus Lock sessions correlate with higher completion and lower phone-distraction reflection tags
