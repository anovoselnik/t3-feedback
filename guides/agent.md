# Set up t3-feedback: guide for coding agents

You are working in the user's project repository. Your job is to make a "Send feedback" button appear on the project's staging site, so that feedback sent from it opens a T3 Code thread on one of the user's machines. When a step links another guide, fetch it from `https://raw.githubusercontent.com/anovoselnik/t3-feedback/main/guides/<file>`.

Terms used here:

- **Machine**: a computer on the user's tailnet that runs T3 Code and a **receiver**, the small service that turns feedback into a thread.
- **Widget**: the script tag on the staging site that shows the button.

## 1. Collect the facts

Find these yourself first, then ask the user for whatever is still missing, in one message:

- **Project slug**: `owner/name` from `git remote get-url origin`. It must be a GitHub remote.
- **Staging hostnames**: where the staging site runs, such as `staging.example.com` or `mysite.local`. Look in deploy config, `.env.example`, and CI files before you ask.
- **Machines**: a name and a tailnet hostname for each machine that should take feedback. `tailscale status` lists the hosts on the tailnet. Ask which of them run T3 Code.
- **This machine's OS**, from `uname -s`.

Done when you have all four and the user has confirmed the staging hostnames and the list of machines.

## 2. Make sure this machine has a working receiver

Check whether the receiver already answers:

```sh
curl -s https://<this-machine>.<tailnet>.ts.net:7777/health
```

- It returns `{"machine":"...","t3Reachable":true}`: the receiver is ready. Note its `machine` name and go to step 3.
- It fails or returns nothing: set it up by following [machine-linux.md](machine-linux.md) on Linux or [machine-macos.md](machine-macos.md) on macOS. Put the staging origins from step 1 in `allowedOrigins`.
- It returns `t3Reachable: false`: T3 Code isn't running. Ask the user to start it.

Ask the user before you create a T3 Code token or change Tailscale Serve settings. Both act outside this repository. Keep the token in `~/.config/t3-feedback/token` with mode 600. It has full access to T3 Code, so it never goes into the repository or the page.

Expose the receiver with `tailscale serve` only. Funnel would put it on the public internet.

Done when the health check returns `t3Reachable: true` and `~/.config/t3-feedback/config.json` lists every staging origin from step 1.

## 3. Check that T3 Code has this project

The receiver finds the T3 Code project whose clone has an `origin` remote matching the project slug. That clone also needs an `origin/HEAD` ref. Check the clone T3 Code uses (usually the current repository):

```sh
git rev-parse --abbrev-ref origin/HEAD
```

If that fails, run `git remote set-head origin --auto`. If the user hasn't added the repository to T3 Code on this machine, ask them to add it.

Done when `origin/HEAD` resolves and the user confirms T3 Code has the project.

## 4. Add the widget to the staging site

Identify the stack, then follow its guide:

| Signs in the repository | Guide |
| --- | --- |
| `style.css` with a `Theme Name:` header, or `functions.php` | [embed-wordpress.md](embed-wordpress.md) |
| `Gemfile` and `config/application.rb` | [embed-rails.md](embed-rails.md) |
| `vite.config.*` | [embed-vite.md](embed-vite.md) |

For any other stack, add the plain script tag from the "Set up" section of `https://raw.githubusercontent.com/anovoselnik/t3-feedback/main/README.md` to the HTML layout, behind whatever check the project already uses to tell staging from production.

Fill in the slug from step 1. Build `data-machines` from step 1, using each receiver's `machine` name as the key and `https://<hostname>:7777` as the value. Use the same release tag that the guide uses.

The tag must render on staging hosts only, and it must be a classic script, without `type="module"`.

Done when the change renders the tag on a staging host and renders nothing on production. Show where the gate is in your summary.

## 5. Hand off the other machines

You can only configure the machine you are running on. For every other machine from step 1, tell the user to add the staging origins to that machine's `allowedOrigins` and restart its receiver. If a machine has no receiver yet, point them to the guide for its OS.

## 6. Verify and report

Offer to run the test command from step 6 of the machine guide with this project's slug. It starts a real T3 Code thread in a new worktree, so run it only after the user agrees. It should return a `threadUrl`.

Then tell the user:

- which files you changed, and the condition that gates the tag to staging
- that the change has to be deployed to staging before the button appears there
- that the first visit asks for local network access in Chrome and Firefox, and they should allow it
- what is still left for them to do from step 5

If the button doesn't appear after they deploy, see [troubleshooting.md](troubleshooting.md).
