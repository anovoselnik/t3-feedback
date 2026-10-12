# Receiver setup on macOS

Notes for the README ticket (#10). These steps install the Receiver on antonios-laptop with the same code as omarchy ([setup-linux.md](setup-linux.md)). Only the service definition and the config differ: a launchd agent in place of the systemd unit, and the Machine's own label and hostnames.

Written on 2026-10-12 ahead of the install and not yet run on the laptop. Record the macOS, Node, and t3 versions here once they have been, and correct any step that did not work as written.

Prerequisites are the same as on Linux: Node 22 or newer, T3 Code running on loopback port 3773, Tailscale with HTTPS certificates enabled for the tailnet, and the Machine's T3 Code projects cloned with an `origin` remote and an `origin/HEAD` ref (`git remote set-head origin --auto` if missing). Git comes from the Xcode Command Line Tools (`xcode-select --install`). The Receiver runs `git fetch` as a background agent with no TTY. If that fetch cannot authenticate (an SSH key with a passphrase that is not in the agent, say), Threads still start, but from the local default branch with a note that the base may be stale.

Keep the Projects out of `~/Desktop`, `~/Documents`, and `~/Downloads`. macOS blocks background processes from those folders unless they are granted access, so the Receiver's `git` calls there fail with "Operation not permitted".

If the Tailscale app is installed but `tailscale` is not on your PATH, use the app's "Install CLI" setting or run `/Applications/Tailscale.app/Contents/MacOS/Tailscale` in its place.

Check that T3 Code listens on 3773 before writing the config: `lsof -nP -iTCP:3773 -sTCP:LISTEN`. If that prints nothing, `lsof -nP -iTCP -sTCP:LISTEN` lists every listener; put T3 Code's port in `t3BaseUrl`.

## 1. Install the code

```sh
git clone https://github.com/anovoselnik/t3-feedback.git ~/.local/share/t3-feedback
```

To update later: `git -C ~/.local/share/t3-feedback pull --ff-only && launchctl kickstart -k gui/$(id -u)/t3-feedback-receiver`.

## 2. Mint the token

```sh
(umask 077; mkdir -p ~/.config/t3-feedback && t3 auth session issue --label t3-feedback --ttl 365d --token-only > ~/.config/t3-feedback/token)
```

If T3 Code on the Machine keeps its data somewhere other than the default, pass that directory with `--base-dir`, or the token is minted for an environment the running T3 Code does not know. `t3 auth session list` shows the token with client `t3-feedback | bot` and its expiry.

## 3. Write the config

The Receiver reads `~/.config/t3-feedback/config.json` on macOS too. `tailscale status --json | jq -r '.User[(.Self.UserID|tostring)].LoginName'` prints `tailscaleLogin`; `jq` ships with macOS 15 and later. The Machine's T3 Code web UI already answers on the tailnet at `https://antonios-laptop.tail8fd60a.ts.net` (checked from omarchy on 2026-10-12).

```sh
(umask 077; cat > ~/.config/t3-feedback/config.json) <<'EOF'
{
  "machine": "laptop",
  "tailscaleLogin": "you@example.com",
  "tokenPath": "~/.config/t3-feedback/token",
  "t3BaseUrl": "http://127.0.0.1:3773",
  "webUiBaseUrl": "https://antonios-laptop.tail8fd60a.ts.net",
  "allowedOrigins": ["https://staging.cajanka.hr", "https://*.local", "http://*.local"]
}
EOF
```

## 4. Install the launchd agent

`receiver/t3-feedback-receiver.plist` starts the Receiver when you log in and restarts it after any failure, no sooner than 5 seconds after it last started. launchd does not expand `~`, so the install replaces `__HOME__` with your home directory. It finds `node` on a PATH that includes the mise shims and Homebrew; edit the `PATH` entry if Node lives elsewhere.

```sh
mkdir -p ~/Library/LaunchAgents
sed "s|__HOME__|$HOME|g" ~/.local/share/t3-feedback/receiver/t3-feedback-receiver.plist \
  > ~/Library/LaunchAgents/t3-feedback-receiver.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/t3-feedback-receiver.plist
launchctl print gui/$(id -u)/t3-feedback-receiver | grep -E 'state|pid'
tail -f ~/Library/Logs/t3-feedback-receiver.log
```

macOS shows a "Background Items Added" notification; the agent is listed under System Settings > General > Login Items and must stay allowed there. The log shows `T3 Code environment <id>` and `Receiver for laptop listening on http://127.0.0.1:7777`.

To change the agent, edit the plist in the repo, run `launchctl bootout gui/$(id -u)/t3-feedback-receiver`, then repeat the `sed` and `bootstrap` lines. If `bootstrap` fails with `5: Input/output error`, the old job is still tearing down; run it again. To remove the agent, boot it out and delete `~/Library/LaunchAgents/t3-feedback-receiver.plist`.

launchd does not rotate `~/Library/Logs/t3-feedback-receiver.log`; truncate it by hand if it grows.

## 5. Expose it with Tailscale Serve

This adds port 7777 next to the existing Serve on 443 for the T3 Code web UI.

```sh
tailscale serve --bg --https=7777 http://127.0.0.1:7777
tailscale serve status
```

To remove it: `tailscale serve --https=7777 off`.

## 6. Check it from another host on the tailnet

```sh
R=https://antonios-laptop.tail8fd60a.ts.net:7777
curl -w ' [%{http_code}]\n' $R/health
# {"machine":"laptop","t3Reachable":true} [200]

curl -w ' [%{http_code}]\n' -H 'Origin: https://evil.example' $R/health
# {"error":"Origin https://evil.example is not allowed"} [403]

curl $R/feedback -F project=anovoselnik/t3-feedback -F machine=laptop \
  -F 'message=Smoke test: reply "ok" and make no changes.' \
  -F pageUrl=https://staging.example.local/ -F viewport=1280x800 \
  -F 'image=@screenshot.png;type=image/png'
# {"threadId":"…","threadUrl":"https://antonios-laptop.tail8fd60a.ts.net/<environment>/<thread>"}
```

Open the `threadUrl` and confirm it shows the new Thread on the laptop. The Widget has no Machine chooser yet, so this curl stands in for a Feedback sent from a Staging page with the laptop chosen. The identity checks behave as described in [setup-linux.md](setup-linux.md#6-check-it-from-another-host-on-the-tailnet).
