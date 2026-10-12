# Receiver setup on macOS

Notes for the README ticket (#10). These steps install the Receiver on antonios-laptop with the same code as omarchy ([setup-linux.md](setup-linux.md)). Only the service definition and the config differ: a launchd agent in place of the systemd unit, and the laptop's own Machine label and hostnames.

Prerequisites are the same as on Linux: Node 22 or newer, T3 Code running on loopback port 3773, Tailscale with HTTPS certificates enabled for the tailnet, and the laptop's T3 Code projects cloned with an `origin` remote and an `origin/HEAD` ref (`git remote set-head origin --auto` if missing). Git comes from the Xcode Command Line Tools (`xcode-select --install`).

If the Tailscale app is installed but `tailscale` is not on your PATH, use the app's "Install CLI" setting or run `/Applications/Tailscale.app/Contents/MacOS/Tailscale` in its place.

Check which port T3 Code listens on before writing the config: `lsof -nP -iTCP -sTCP:LISTEN | grep -i t3`. Use that port in `t3BaseUrl` if it is not 3773.

## 1. Install the code

```sh
git clone https://github.com/anovoselnik/t3-feedback.git ~/.local/share/t3-feedback
```

To update later: `git -C ~/.local/share/t3-feedback pull --ff-only && launchctl kickstart -k gui/$(id -u)/t3-feedback-receiver`.

## 2. Mint the token

```sh
(umask 077; mkdir -p ~/.config/t3-feedback && t3 auth session issue --label t3-feedback --ttl 365d --token-only > ~/.config/t3-feedback/token)
```

If T3 Code on the laptop keeps its data somewhere other than the default, pass that directory with `--base-dir`, or the token is minted for an environment the running T3 Code does not know. `t3 auth session list` shows the token with client `t3-feedback | bot` and its expiry.

## 3. Write the config

The Receiver reads `~/.config/t3-feedback/config.json` on macOS too. `tailscale status --json | jq -r '.User[(.Self.UserID|tostring)].LoginName'` prints `tailscaleLogin`; `jq` ships with macOS 15 and later. The laptop's T3 Code web UI is already served on the tailnet at `https://antonios-laptop.tail8fd60a.ts.net`.

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

`receiver/t3-feedback-receiver.plist` starts the Receiver when you log in and restarts it 5 seconds after any failure. launchd does not expand `~`, so the install replaces `__HOME__` with your home directory. It finds `node` on a PATH that includes the mise shims and Homebrew; edit the `PATH` entry if Node lives elsewhere.

```sh
mkdir -p ~/Library/LaunchAgents
sed "s|__HOME__|$HOME|g" ~/.local/share/t3-feedback/receiver/t3-feedback-receiver.plist \
  > ~/Library/LaunchAgents/t3-feedback-receiver.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/t3-feedback-receiver.plist
launchctl print gui/$(id -u)/t3-feedback-receiver | grep -E 'state|pid'
tail -f ~/Library/Logs/t3-feedback-receiver.log
```

The log shows `T3 Code environment <id>` and `Receiver for laptop listening on http://127.0.0.1:7777`.

To reload after editing the plist: `launchctl bootout gui/$(id -u)/t3-feedback-receiver` and then the `bootstrap` line again. To remove it, boot it out and delete the plist from `~/Library/LaunchAgents`.

macOS asks before a background process reads `~/Desktop`, `~/Documents`, or `~/Downloads`. If a Project lives there, the Receiver's `git` calls can fail with "Operation not permitted"; move the clone elsewhere or give `node` Full Disk Access in System Settings > Privacy & Security.

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

curl $R/feedback -F project=anovoselnik/t3-feedback -F machine=laptop \
  -F 'message=Smoke test: reply "ok" and make no changes.' \
  -F pageUrl=https://staging.example.local/ -F viewport=1280x800
# {"threadId":"…","threadUrl":"https://antonios-laptop.tail8fd60a.ts.net/<environment>/<thread>"}
```

Open the `threadUrl` and confirm it shows the new Thread. The identity checks behave as described in [setup-linux.md](setup-linux.md#6-check-it-from-another-host-on-the-tailnet).
