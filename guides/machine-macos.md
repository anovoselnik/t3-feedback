# Set up a machine on macOS

This guide installs the receiver as a launchd agent and exposes it on your tailnet with Tailscale Serve. Repeat it on every Mac that should take feedback. Tested on macOS 26.7 with the T3 Code desktop app (t3 v0.0.45) and the Tailscale app 1.104.1.

## Before you start

You need:

- The T3 Code desktop app, running. It listens on `127.0.0.1:3773`.
- Node 22 or newer
- The Tailscale app, connected, with HTTPS certificates enabled for your tailnet
- Git, from the Xcode Command Line Tools (`xcode-select --install`)
- `jq`

Keep your projects out of `~/Documents`, `~/Desktop`, and `~/Downloads`. macOS blocks background processes from those folders unless you grant Node Full Disk Access.

Each project needs an `origin` remote and an `origin/HEAD` ref in its clone. If the receiver rejects feedback for a project, run `git remote set-head origin --auto` in that clone.

If `tailscale` isn't on your PATH, turn on "Install CLI" in the Tailscale app's settings, or use `/Applications/Tailscale.app/Contents/MacOS/tailscale`.

## 1. Install the code

The service runs from its own clone. Switching branches in another checkout doesn't affect it.

```sh
git clone https://github.com/anovoselnik/t3-feedback.git ~/.local/share/t3-feedback
```

## 2. Create a T3 Code token

The desktop app doesn't put `t3` on your PATH, so run the CLI through npx. Replace `0.0.45` with the version of your T3 Code app. The token has full access to T3 Code, so only your user can read the file. It expires after one year. Create a new one before then.

```sh
(umask 077; mkdir -p ~/.config/t3-feedback && npx -y t3@0.0.45 auth session issue --label t3-feedback --ttl 365d --token-only > ~/.config/t3-feedback/token)
```

The CLI reads T3 Code's state from `~/.t3`, where the desktop app keeps it. If your T3 Code keeps its data somewhere else, add `--base-dir <that directory>`. Without it, the token belongs to an environment the running app doesn't know.

## 3. Write the config

Find your Tailscale login and this machine's tailnet hostname:

```sh
tailscale status --json | jq -r '.User[(.Self.UserID|tostring)].LoginName'
tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//'
```

Then write `~/.config/t3-feedback/config.json`:

```sh
(umask 077; cat > ~/.config/t3-feedback/config.json) <<'EOF'
{
  "machine": "laptop",
  "tailscaleLogin": "you@github",
  "tokenPath": "~/.config/t3-feedback/token",
  "webUiBaseUrl": "https://laptop.tail1234.ts.net",
  "allowedOrigins": ["https://staging.example.com", "https://*.local"]
}
EOF
```

- `machine` is the name the button shows. Use the same name in your site's `data-machines` map.
- `tailscaleLogin` is the login from the first command.
- `webUiBaseUrl` is the address of this machine's T3 Code web UI on your tailnet. "Open thread" links point here. If nothing serves T3 Code there yet, run `tailscale serve --bg http://127.0.0.1:3773`.
- `allowedOrigins` lists your staging sites. `*` matches anything except `/`.

[receiver/config.example.json](../receiver/config.example.json) shows the optional keys: `port` (default 7777), `t3BaseUrl` (default `http://127.0.0.1:3773`), and `fallbackModelSelection`, the model used when the project has no default in T3 Code.

## 4. Install the launchd agent

launchd doesn't expand `~` or `$HOME`, so the commands below fill in your home directory and the full path to Node. Point `NODE` at a real Node binary, not a version-manager shim like `~/.nodenv/shims/node`, because a shim can pick a Node older than 22.

```sh
NODE=/opt/homebrew/bin/node      # or $(nodenv prefix 24.18.1)/bin/node, or wherever your Node 22+ lives
"$NODE" --version                # must print v22 or newer

PLIST=~/Library/LaunchAgents/com.github.anovoselnik.t3-feedback-receiver.plist
sed -e "s|__HOME__|$HOME|g" -e "s|__NODE__|$NODE|g" \
  ~/.local/share/t3-feedback/receiver/t3-feedback-receiver.plist > "$PLIST"
plutil -lint "$PLIST"
launchctl bootstrap gui/$(id -u) "$PLIST"
tail -f ~/Library/Logs/t3-feedback-receiver.log
```

The log should show `Receiver for <machine> listening on http://127.0.0.1:7777`. macOS shows a "Background Items Added" notification, and the agent appears under System Settings > General > Login Items & Extensions.

The agent starts when you log in and restarts if it crashes. A Mac that is asleep doesn't answer, so the button leaves it out of the machine list.

## 5. Expose it on your tailnet

```sh
tailscale serve --bg --https=7777 http://127.0.0.1:7777
```

Serve runs only while the Tailscale app is connected. Use Serve only. Funnel would expose the receiver to the internet.

## 6. Check it

From this machine or any other device on your tailnet:

```sh
curl https://laptop.tail1234.ts.net:7777/health
# {"machine":"laptop","t3Reachable":true}
```

If `t3Reachable` is false, the T3 Code app isn't running or `t3BaseUrl` is wrong.

To send a test feedback without a staging site, use the slug of a project that T3 Code has on this machine:

```sh
curl https://laptop.tail1234.ts.net:7777/feedback \
  -F project=your-github-user/your-repo -F machine=laptop \
  -F 'message=Smoke test: reply "ok" and make no changes.' \
  -F pageUrl=https://staging.example.com/ -F viewport=1280x800
```

It returns a `threadUrl`. Open it to see the new thread.

## Manage the agent

```sh
LABEL=gui/$(id -u)/com.github.anovoselnik.t3-feedback-receiver
launchctl print $LABEL | grep -E 'state|pid|last exit'   # status
launchctl kickstart -k $LABEL                             # restart
launchctl bootout $LABEL && rm "$PLIST"                   # remove
```

To update, run `git -C ~/.local/share/t3-feedback pull --ff-only`, then restart.

After editing the plist, run `bootout` and then `bootstrap` again, because `kickstart` keeps the old definition. If `bootstrap` fails with `5: Input/output error`, the old job is still stopping. Run it again.

launchd doesn't rotate `~/Library/Logs/t3-feedback-receiver.log`. Truncate it if it grows too large.

## Next

[Add the button to your staging site](../README.md#set-up).
