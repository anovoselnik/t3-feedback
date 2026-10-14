# t3-feedback

A "Send feedback" button for your staging sites. Type what's wrong, paste a screenshot, pick one of your machines, and a coding agent starts fixing it in [T3 Code](https://github.com/pingdotgg/t3code).

<!-- Demo video goes here. -->

## How it works

1. You add one `<script>` tag to your staging site. It shows a small feedback button.
2. You write a message and paste or attach a screenshot. The button sends it over your [Tailscale](https://tailscale.com) network to a small service on the machine you pick.
3. That service opens a new T3 Code thread in a fresh git worktree of the right project. The thread includes your message, the screenshot, the page URL, and the viewport size, and the agent starts right away.
4. The button shows an "Open thread" link.

Only you see the button. It shows up only when your device can reach one of your machines over Tailscale. Visitors off your tailnet never see it.

## Requirements

- [T3 Code](https://github.com/pingdotgg/t3code) running on each machine that should take feedback
- [Tailscale](https://tailscale.com) on those machines and on the devices you browse staging from, with HTTPS certificates enabled
- Node 22 or newer on each machine
- Your projects on GitHub, cloned on each machine and added to T3 Code

## Set up

**1. Set up each machine.** Install the receiver service, give it a T3 Code token, and expose it on your tailnet.

- [Linux](guides/machine-linux.md)
- [macOS](guides/machine-macos.md)

**2. Add the button to your staging site.**

- [WordPress](guides/embed-wordpress.md)
- [Rails](guides/embed-rails.md)
- [Vite (React, Vue, Svelte, ...)](guides/embed-vite.md)

On any other site, add this tag to staging pages only:

```html
<script
  src="https://cdn.jsdelivr.net/gh/anovoselnik/t3-feedback@v0.2.0/widget/t3-feedback.js"
  data-project="your-github-user/your-repo"
  data-machines='{"desktop": "https://desktop.tail1234.ts.net:7777", "laptop": "https://laptop.tail1234.ts.net:7777"}'
></script>
```

`data-project` is the repository's GitHub slug. `data-machines` maps each machine's name to its receiver URL. Leave out `type="module"`, because the script finds its own tag through `document.currentScript`, which is null in modules.

### Let your coding agent do it

Open your project in your coding agent and give it this prompt:

```
Set up t3-feedback for this project by following
https://github.com/anovoselnik/t3-feedback/blob/main/guides/agent.md
```

The agent checks the machine, sets up the receiver if it is missing, and adds the button to your staging site. It asks you for your staging hostname and which machines to use.

## Security

- The T3 Code token stays in a file on each machine. The page never sees it.
- The receiver listens on localhost only. Tailscale Serve exposes it to your tailnet, and the receiver accepts requests only from your Tailscale login.
- Each receiver accepts requests only from the staging origins you list in its config.
- Never expose the receiver with Tailscale Funnel.

## Troubleshooting

The button doesn't show, the browser asks about local network access, or a thread starts from a stale branch? See [guides/troubleshooting.md](guides/troubleshooting.md).

## Development

```sh
npm test            # receiver unit tests, no T3 Code or Tailscale needed
npm run test-page   # manual test page on http://localhost:7779 with fake receivers
```

The receiver is in [receiver/](receiver/). The widget is one dependency-free file, [widget/t3-feedback.js](widget/t3-feedback.js). [CONTEXT.md](CONTEXT.md) defines the project's terms, [docs/PRD.md](docs/PRD.md) explains the design, and [docs/releasing.md](docs/releasing.md) covers releasing a new widget version.

## License

[MIT](LICENSE)
