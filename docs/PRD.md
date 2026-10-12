# PRD: t3-feedback

Status: needs-triage. Written 2026-10-12 from the design session that produced [CONTEXT.md](../CONTEXT.md), [ADR-0001](adr/0001-project-identity-by-github-slug.md), and [ADR-0002](adr/0002-receiver-per-machine.md). Vocabulary follows the glossary: Widget, Receiver, Machine, Feedback, Project, Thread, Staging page.

## Problem Statement

I look at staging deployments of my projects (a WordPress theme, Rails apps, React apps) and spot UI problems constantly. Turning one of those into work today means: take a screenshot, switch to the machine where T3 Code runs, find the project, start a thread, paste the screenshot, type the context, and remember which page it was on. The friction is high enough that small issues go unreported, and the ones I do report lose context (page URL, viewport) along the way. I also work from two machines, so I need to choose which one picks the work up.

## Solution

A "Send feedback" button on every staging page. Clicking it opens a one-field form where I type a message and paste a screenshot from the clipboard (or attach one from the photo picker on a phone). I pick which of my Machines should handle it, press send, and a new T3 Code Thread starts on that Machine, in a fresh worktree of the right Project, with the screenshot, my message, the page URL, and the viewport already in the first message and the agent already working. The form then shows a link that opens the Thread.

The button is only visible to me: it appears only on non-production deployments and only when my device is on the tailnet and at least one Machine answers.

## User Stories

1. As the developer, I want a "Send feedback" button on every staging page of my projects, so that reporting a UI problem takes seconds instead of a context switch.
2. As the developer, I want the button hidden on production, so that visitors never see it.
3. As the developer, I want the button hidden when none of my Machines is reachable, so that clients looking at staging see nothing confusing.
4. As the developer, I want to paste a screenshot from the clipboard into the form, so that I can report exactly what I saw.
5. As the developer, I want to see a thumbnail of the pasted screenshot, so that I know the paste worked before I send.
6. As the developer, I want to attach an image from the photo picker on my phone, so that I can report problems I notice on mobile.
7. As the developer, I want to send a message without a screenshot, so that text-only feedback is possible.
8. As the developer, I want large screenshots downscaled automatically, so that sending never fails on size.
9. As the developer, I want to choose which Machine handles the Feedback, so that I can direct work to the computer I am going to sit at.
10. As the developer, I want the Machine chooser to show only Machines that are currently online, so that I do not send to a sleeping laptop.
11. As the developer, I want my last-used Machine remembered per site, so that I rarely have to choose.
12. As the developer, I want the page URL and viewport size sent automatically, so that the agent knows where to look and at what width.
13. As the developer, I want each Feedback to start a new Thread in a fresh worktree on its own branch, so that fixes are isolated and can become separate pull requests.
14. As the developer, I want the worktree based on the latest default branch from origin, so that the agent works on what staging actually runs.
15. As the developer, I want the Feedback still to go through when GitHub is unreachable, so that an outage does not block me, and I want the agent told that the base may be stale.
16. As the developer, I want the agent told the symptom is visual but the cause may be anywhere, so that it does not assume a CSS-only fix.
17. As the developer, I want the agent to run in full-access mode immediately, so that I do not have to approve a plan for every small fix.
18. As the developer, I want the Thread to use the Project's default model when one is set in T3 Code, so that per-project model choices are respected.
19. As the developer, I want a sensible fallback model when no default is set, so that Threads always start.
20. As the developer, I want the Thread title to be the first line of my message, so that I recognise it in the sidebar.
21. As the developer, I want an "Open thread" link after sending, so that I can jump straight to the agent's work.
22. As the developer, I want a clear error when the chosen Machine has no T3 Code project for this repository, so that I know to add it there.
23. As the developer, I want a clear error when the send fails, so that I know whether to retry or check Tailscale.
24. As the developer, I want the send button disabled while a send is in flight, so that a double click does not create two Threads.
25. As the developer, I want the Widget to keep working after a Turbo Drive navigation in a Rails app, so that it does not vanish or duplicate.
26. As the developer, I want the Widget visually isolated from the host site's CSS, so that a WordPress theme cannot break it.
27. As the developer, I want one hosted script URL used by every project, so that fixing the Widget once fixes it everywhere.
28. As the developer, I want the script URL pinned to a release tag, so that a Widget change cannot break a staging site unexpectedly.
29. As the developer, I want one-line embed snippets for WordPress, Rails, and Vite, so that adding a project is trivial.
30. As the developer, I want the WordPress embed to show the Widget on both front-end and wp-admin pages of staging, so that admin-side problems are reportable too.
31. As the developer, I want the WordPress embed gated on hostname, so that it works even though staging's wp-config is outside the repo.
32. As the developer, I want each Receiver to accept requests only from allowlisted staging origins, so that a random site I visit cannot start Threads.
33. As the developer, I want each Receiver to accept requests only from my Tailscale identity, so that nobody else on the tailnet could use it.
34. As the developer, I want the T3 Code token stored only on the Machine, so that it is never in page source.
35. As the developer, I want the Receiver to start at login on both Machines, so that I never have to remember to run it.
36. As the developer, I want a health endpoint on each Receiver, so that the Widget can probe reachability.
37. As the developer, I want the Receiver installable on macOS and Linux with the same code, so that both Machines behave the same.
38. As the developer, I want the Receiver to run the Project's setup script in the new worktree, so that Threads it creates behave like ones created from the T3 Code UI.
39. As the developer, I want a manual test page in the repo, so that I can try the Widget without deploying anything.
40. As the developer, I want unit tests on the Receiver's decision logic, so that the dispatch command stays correct as T3 Code evolves.

## Implementation Decisions

### Repository

One public repository, `anovoselnik/t3-feedback`, holding the Widget, the Receiver, the glossary, ADRs, this PRD, and a README with embed snippets. Public because jsDelivr serves the Widget from it. Nothing secret is committed.

### Widget

- One vanilla JavaScript file, classic script, no build step, no dependencies. Served from jsDelivr at a pinned tag.
- Configured through data attributes on its script tag: the Project slug (`owner/name`) and a JSON map of Machine label to Receiver base URL. Optional attribute for the Receiver path.
- Mounts into a Shadow DOM host with `all: initial` isolation. The host element is marked permanent for Turbo Drive.
- On load, probes every Machine's health endpoint with a short timeout. Renders the button only if at least one answers. Machines that do not answer are omitted from the chooser. The probe is what triggers the browser's one-time local-network permission prompt.
- Chooser defaults to the last-used Machine for this site (localStorage), falling back to the first online one.
- Single textarea. A paste listener reads the clipboard synchronously, takes the first image item, and prevents default only when an image was found. A separate file input accepts an image from the photo picker. One image at a time; a new one replaces the previous.
- Images that are not PNG or JPEG, or exceed about 1.5 MB, are downscaled to a maximum of 1920 px and re-encoded as JPEG through a canvas.
- Sends `multipart/form-data` with: project, machine, message, pageUrl, viewport, userAgent, and the optional image file. Multipart with no custom headers avoids a CORS preflight.
- Send button disabled while in flight. Success shows "Sent" with an "Open thread" link built from the Receiver's response. Failure shows the error and a hint to check Tailscale.
- Keyboard: Ctrl/Cmd+Enter sends, Escape closes.

### Receiver

- One Node module, no dependencies, Node 22 or newer (the dispatch needs the global `WebSocket` client). Binds to loopback on port 7777. Exposed as HTTPS on the Machine's tailnet hostname through Tailscale Serve on the same port. Runs as a systemd user service on Linux and a launchd agent on macOS.
- Configuration file holds: path to the T3 Code token, T3 Code base URL (loopback), allowed origin patterns, the fallback model selection (Opus 5.5, medium effort), and the Machine's public web UI base URL for building Thread links.
- Request handling: answer OPTIONS preflight for allowlisted origins; reject any request whose Tailscale login header is missing or not the configured identity; reject non-allowlisted origins; parse multipart; enforce a 10 MB image limit.
- Project resolution (ADR-0001): fetch T3 Code's orchestration snapshot, and for each project read the `origin` remote of its workspace root. Match on `owner/name` ignoring `.git` suffix and SSH versus HTTPS form. No match is a 404 with a message naming the slug and the Machine.
- Branch preparation: determine the default branch from the local `origin/HEAD` ref. Fetch it from origin with a 10 second timeout. On success, request the worktree to start from origin. On failure, start from the local branch and add a note to the message that the base may be stale. Branch name: `feedback/<slug-of-first-message-line>-<4 hex>`.
- Dispatch: one `thread.turn.start` command sent over T3 Code's WebSocket RPC, not the HTTP dispatch endpoint. `POST /api/orchestration/dispatch` skips bootstrap handling, so a command with a `createThread` bootstrap fails there with "Thread '<id>' does not exist". Only the WebSocket `orchestration.dispatchCommand` method creates the thread and worktree. Verified 2026-10-12 on omarchy, t3 v0.0.45. The exchange:
  1. `POST <T3 base>/api/auth/websocket-ticket` with `Authorization: Bearer <token>` returns `{ "ticket", "expiresAt" }`.
  2. Open `ws://127.0.0.1:3773/ws?wsTicket=<ticket>`.
  3. Send one Effect RPC JSON frame: `{ "_tag": "Request", "id": "1", "tag": "orchestration.dispatchCommand", "payload": <command>, "headers": [] }`.
  4. Wait for the frame `{ "_tag": "Exit", "requestId": "1", "exit": { "_tag": "Success", "value": { "sequence": <n> } } }`, then close. A failure arrives as `exit._tag: "Failure"` with a `cause` array.

  The command, with every id a fresh UUID generated by the Receiver and every `createdAt` the current ISO time:

  ```json
  {
    "type": "thread.turn.start",
    "commandId": "<uuid>",
    "threadId": "<uuid>",
    "message": {
      "messageId": "<uuid>",
      "role": "user",
      "text": "<template + message>",
      "attachments": [
        { "type": "image", "name": "screenshot.png", "mimeType": "image/png", "sizeBytes": 12345, "dataUrl": "data:image/png;base64,..." }
      ]
    },
    "modelSelection": { "instanceId": "claudeAgent", "model": "claude-opus-5-5", "options": [{ "id": "effort", "value": "medium" }] },
    "runtimeMode": "full-access",
    "interactionMode": "default",
    "bootstrap": {
      "createThread": {
        "projectId": "<project id>",
        "title": "Feedback: <first line>",
        "modelSelection": { "...": "same as above" },
        "runtimeMode": "full-access",
        "interactionMode": "default",
        "branch": "<base branch>",
        "worktreePath": null,
        "createdAt": "<iso>"
      },
      "prepareWorktree": {
        "projectCwd": "<project workspaceRoot>",
        "baseBranch": "<base branch>",
        "branch": "feedback/<slug>-<4 hex>",
        "startFromOrigin": true,
        "requireWorktree": true
      },
      "runSetupScript": true
    },
    "createdAt": "<iso>"
  }
  ```

  Details verified in the spike:
  - Do not send the top-level `titleSeed` the web client sends. When `titleSeed` equals the thread title, T3 Code treats the title as a placeholder and replaces it with a generated one after the first turn. Without it, "Feedback: …" stays.
  - `modelSelection.options` is an array of `{ id, value }` pairs, not an object. The Project default (`defaultModelSelection` in the snapshot) already has this shape.
  - `createThread.branch` is the base branch and `worktreePath` is null, as in the web client. The server points the thread at the new branch and worktree once they exist.
  - The worktree is created at `~/.t3/worktrees/<project folder>/<branch with "/" replaced by "-">`. The server renames only temporary `t3code/<8 hex>` branches, so `feedback/…` names are kept.
  - Image attachments need no `id`. The server stores the file and assigns one.
  - With `startFromOrigin: true` the server runs its own `git fetch origin <base>` and does not catch a failure, so an unreachable origin fails the whole dispatch. The Receiver's own fetch with a timeout is what decides whether to send the flag.
  - Deleting a thread (`thread.delete`) leaves its worktree and branch on disk.
- Model selection: the Project's default from the snapshot when present, else the configured fallback.
- Title: "Feedback: " plus the first line of the message trimmed to about 60 characters.
- Message template, then the user's message:

  > UI feedback from staging page `<URL>` (viewport `<w>x<h>`), screenshot attached. The symptom is visual, but the cause may be anywhere: trace from the rendered page back through templates, components, and backend code that produce it. Make the change the message asks for and verify it on a local preview before finishing.

  The staleness note is appended when the fetch failed. "screenshot attached" is omitted when there is no image.
- Response: JSON with thread id and a URL of the form `<web UI base>/<environmentId>/<threadId>`. T3 Code's dispatch result is only `{ sequence }`, so the thread id is the one the Receiver generated for the command. The environment id is read at startup from `GET /.well-known/t3/environment` (no auth; field `environmentId`). On omarchy the web UI base is `https://omarchy.tail8fd60a.ts.net`, where Tailscale Serve on 443 proxies T3 Code on 3773. The link opens the Thread on any browser already paired with that environment; an unpaired browser is sent to `/pair` first.
- Health endpoint returns the Machine label and whether T3 Code is reachable.

### Modules (deep modules, testable in isolation)

- **Project resolver**: slug plus a list of (project, workspace root) plus a remote-reader function, returns the matching project or nothing. Pure given the reader.
- **Branch preparer**: workspace root plus a git-runner function, returns base branch, start-from-origin flag, branch name, and an optional staleness note.
- **Dispatch builder**: Feedback, resolved project, branch info, config, returns the complete T3 Code command object. Pure; this is where most of the correctness lives.
- **HTTP layer**: CORS allowlist, identity check, multipart parsing, health. Thin over Node's http module.
- **T3 Code client**: snapshot and environment descriptor over HTTP, dispatch over a short-lived WebSocket (ticket, one request, one exit frame). Thin wrapper over `fetch` and `WebSocket`.
- **Widget**: image capture (paste or picker to normalised Blob), Machine registry (probe, selection, persistence), submit. Kept as internal functions in the single file.

### Cajanka wiring

A footer hook in the theme, on both `wp_footer` and `admin_footer`, echoes the script tag when the request host is `staging.cajanka.hr` or ends in `.local`. Rails and Vite snippets are documented in the README only.

### Per-Machine setup (documented, not automated in v1)

Mint a token with `t3 auth session issue --label t3-feedback --ttl <long ttl> --token-only` (tokens expire, so set the TTL on purpose), write the config, install the service, enable Tailscale Serve for port 7777. The README carries the exact steps for Linux and macOS.

## Testing Decisions

A good test exercises external behaviour through the module's interface and asserts on outputs, not on how they were produced. Fake the edges (git runner, remote reader, fetch) with plain functions; never mock internals.

Test runner: Node's built-in `node:test`, no dependencies.

Modules under test:

- **Dispatch builder**: full command shape for message with image, message without image, fetch-failed staleness note, project default model versus fallback, title trimming, branch name slugging, worktree flags.
- **Project resolver**: SSH and HTTPS remotes, `.git` suffix, no match, multiple projects.
- **Branch preparer**: fetch success, fetch timeout, missing `origin/HEAD`.
- **HTTP layer**: preflight for allowed and disallowed origins, missing or wrong Tailscale identity, oversized image, health response. Run against an in-process server with real requests.

Widget: a manual test page in the repo that embeds the Widget against a Receiver running locally in a mode that echoes the request instead of dispatching. No automated browser tests in v1.

Prior art: none, this is a new repository.

## Out of Scope

- Anyone other than the developer submitting Feedback. Clients and collaborators are not users of this tool.
- Tailscale Funnel or any public exposure of the Receiver.
- Appending a second Feedback to an existing Thread. Every Feedback is a new Thread.
- Cloning a repository or creating the T3 Code project when a Machine lacks it.
- Multiple images per Feedback.
- Automatic DOM screenshots. Clipboard and picker only.
- Wiring the Rails and React projects. Documented only.
- Notifications when the Thread finishes.
- Narrowing the T3 Code token's scopes. This build's CLI cannot do it.

## Further Notes

- **Live dispatch verified 2026-10-12** (issue #1). A throwaway dispatch against omarchy's t3-feedback project created the Thread in that Project, the `feedback/dispatch-spike-*` worktree and branch from `origin/main`, the image on the first message, and a full-access agent turn that finished with no approval prompt. The Thread URL opened the Thread. The corrections it produced (WebSocket transport, no `titleSeed`, options array, response shape) are in the Dispatch and Response bullets above. The throwaway threads, worktrees, branches, and tokens were removed afterwards.
- **Repository identity in the snapshot.** T3 Code's snapshot has a `repositoryIdentity` (with `owner`, `name`, `provider`) on some projects, but it is null on others that do have an `origin` remote, t3-feedback among them. The resolver can use it as a fast path but must still read `origin` itself, as ADR-0001 says.
- **Browser prompt.** Chrome 142+ and Firefox 151+ show a one-time local-network permission prompt per staging origin because Tailscale addresses are classified as local. Denying it once must be undone in site settings. Safari does not prompt today and may change.
- **Reachability quirk.** Omarchy's tailnet hostname resolves publicly because Funnel is enabled on it, so an off-tailnet probe hangs instead of failing. The probe timeout is what keeps the Widget hidden for outsiders.
- **T3 Code facts relied on** (verified 2026-10-12 on t3 v0.0.45): dispatch accepts inline data-URL image attachments up to 10 MiB; CORS on the T3 Code server is open; the server generates branch names only for temporary `t3code/<8 hex>` branches; the web UI route for a thread is environment id then thread id; Tailscale Serve proxies loopback only and injects the login header.
- **Project resolution cost** is one git command per known project per Feedback. Revisit with a cache if it ever matters.
