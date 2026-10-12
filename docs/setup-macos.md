# Receiver setup on macOS

Notes for the README ticket (#10). These are the steps that installed the Receiver on the laptop (macOS 26.7, T3 Code desktop app, Tailscale app 1.104.1, Node 24.18.1 from nodenv, t3 v0.0.45) on 2026-10-12. The Receiver code is the same as on Linux ([setup-linux.md](setup-linux.md)). Only the service definition and the config differ.

Prerequisites: a Node 22 or newer binary, the T3 Code desktop app running (it serves on port 3773), the Tailscale app with HTTPS certificates enabled for the tailnet, and the Machine's T3 Code projects cloned with an `origin` remote and an `origin/HEAD` ref (`git remote set-head origin --auto` if missing). Git comes from the Xcode Command Line Tools (`xcode-select --install`). The Receiver runs `git fetch` from launchd, with no TTY or SSH agent. If that fetch cannot authenticate (an SSH key with a passphrase, say), Threads still start, but from the local default branch with a note that the base may be stale.

Keep the projects out of `~/Documents`, `~/Desktop` and `~/Downloads`. macOS blocks a background `node` from those folders until you grant it Full Disk Access.

## 1. Install the code

The agent runs from its own clone so that switching branches in a working checkout does not change the running Receiver.

```sh
git clone https://github.com/anovoselnik/t3-feedback.git ~/.local/share/t3-feedback
```

To update later: `git -C ~/.local/share/t3-feedback pull --ff-only && launchctl kickstart -k gui/$(id -u)/com.github.anovoselnik.t3-feedback-receiver`.

## 2. Mint the token

The desktop app does not put `t3` on the PATH, so run the CLI through npx. With no `--base-dir` it reads `~/.t3`, which is where the desktop app keeps its state.

The token carries every T3 Code scope, so it stays in a file only you can read. It expires, so the TTL is set on purpose; mint a new one before it runs out.

```sh
(umask 077; mkdir -p ~/.config/t3-feedback && npx -y t3@0.0.45 auth session issue --label t3-feedback --ttl 365d --token-only > ~/.config/t3-feedback/token)
```

If T3 Code keeps its data somewhere other than `~/.t3`, pass that directory with `--base-dir`. Otherwise the token belongs to an environment the running T3 Code does not know. `npx -y t3@0.0.45 auth session list` shows the token with client `t3-feedback | bot` and its expiry.

## 3. Write the config

Same keys as on Linux; `receiver/config.example.json` shows them. `machine` is the label this Machine has in the Widget's `data-machines` map. `tailscale status --json | jq -r '.User[(.Self.UserID|tostring)].LoginName'` prints the `tailscaleLogin`. On the laptop, Tailscale Serve already proxies `https://antonios-laptop.tail8fd60a.ts.net` to T3 Code on 3773, so that is `webUiBaseUrl`.

```sh
(umask 077; cat > ~/.config/t3-feedback/config.json) <<'EOF'
{
  "machine": "macbook",
  "tailscaleLogin": "you@example.com",
  "tokenPath": "~/.config/t3-feedback/token",
  "t3BaseUrl": "http://127.0.0.1:3773",
  "webUiBaseUrl": "https://antonios-laptop.tail8fd60a.ts.net",
  "allowedOrigins": ["https://staging.cajanka.hr", "https://*.local", "http://*.local"]
}
EOF
```

If `webUiBaseUrl` has no Serve route on your Mac yet, add one with `tailscale serve --bg http://127.0.0.1:3773`.

## 4. Install the launchd agent

`receiver/t3-feedback-receiver.plist` starts the Receiver when you log in and starts it again whenever it exits with an error or gets killed. launchd waits at least 5 seconds between starts, so a crash loop stays slow; after a single `kill -9` the Receiver was back within a second. launchd expands neither `~` nor `$HOME`, so the install fills in two placeholders: `__HOME__`, and `__NODE__`, the absolute path of a Node 22+ binary. Don't point `__NODE__` at a version-manager shim like `~/.nodenv/shims/node`. A shim picks the version from the working directory or the global setting, which can be older than 22.

```sh
NODE=$(nodenv prefix 24.18.1)/bin/node   # or /opt/homebrew/bin/node, or wherever your Node 22+ lives
"$NODE" --version                   # must print v22 or newer

PLIST=~/Library/LaunchAgents/com.github.anovoselnik.t3-feedback-receiver.plist
sed -e "s|__HOME__|$HOME|g" -e "s|__NODE__|$NODE|g" \
  ~/.local/share/t3-feedback/receiver/t3-feedback-receiver.plist > "$PLIST"
plutil -lint "$PLIST"
launchctl bootstrap gui/$(id -u) "$PLIST"
tail -f ~/Library/Logs/t3-feedback-receiver.log
```

The log shows `T3 Code environment <id>` and `Receiver for macbook listening on http://127.0.0.1:7777`. If T3 Code is not up yet, the Receiver logs a warning and looks the environment up again on the first Feedback.

macOS shows a "Background Items Added" notification the first time. The agent then appears under System Settings > General > Login Items & Extensions, where you can turn it off.

Other commands:

- Status: `launchctl print gui/$(id -u)/com.github.anovoselnik.t3-feedback-receiver | grep -E 'state|pid|last exit'`
- Restart: `launchctl kickstart -k gui/$(id -u)/com.github.anovoselnik.t3-feedback-receiver`
- Remove: `launchctl bootout gui/$(id -u)/com.github.anovoselnik.t3-feedback-receiver && rm "$PLIST"`

After editing the plist, run `bootout` and then `bootstrap` again. `kickstart` keeps the old definition. If `bootstrap` fails with `5: Input/output error`, the old job is still shutting down; run it again.

launchd does not rotate `~/Library/Logs/t3-feedback-receiver.log`. Truncate it by hand if it grows.

A LaunchAgent runs only while you are logged in, and a sleeping laptop answers nothing. The Widget's probe times out and leaves the laptop out of the chooser, which is the intended behaviour.

## 5. Expose it with Tailscale Serve

Serve listens on the tailnet address on port 7777 and proxies to loopback 7777, so the two do not collide. It is tailnet only, not Funnel. The `/usr/local/bin/tailscale` that the Tailscale app installs is a wrapper around the app's CLI, and Serve runs only while the app is connected. If `tailscale` is not on your PATH, use the app's "Install CLI" setting or run `/Applications/Tailscale.app/Contents/MacOS/tailscale` in its place.

```sh
tailscale serve --bg --https=7777 http://127.0.0.1:7777
tailscale serve status
```

`tailscale serve status` now lists both routes: `/` to 3773 for the web UI and `:7777` to the Receiver. To remove the Receiver route: `tailscale serve --https=7777 off`.

## 6. Check it from another host on the tailnet

```sh
R=https://antonios-laptop.tail8fd60a.ts.net:7777
curl -w ' [%{http_code}]\n' $R/health
# {"machine":"macbook","t3Reachable":true} [200]

curl -w ' [%{http_code}]\n' -H 'Origin: https://evil.example' $R/health
# {"error":"Origin https://evil.example is not allowed"} [403]

curl $R/feedback -F project=anovoselnik/t3-feedback -F machine=macbook \
  -F 'message=Smoke test: reply "ok" and make no changes.' \
  -F pageUrl=https://staging.example.local/ -F viewport=1280x800 \
  -F 'image=@screenshot.png;type=image/png'
# {"threadId":"…","threadUrl":"https://antonios-laptop.tail8fd60a.ts.net/<environment>/<thread>"}
```

The identity check works the same as on Linux. Serve overwrites `Tailscale-User-Login` with the caller's real login. A login other than `tailscaleLogin` gets 403. A request straight to `127.0.0.1:7777` has no identity header and gets 401.
