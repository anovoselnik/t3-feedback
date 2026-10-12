# Receiver setup on Linux

Notes for the README ticket (#10). These are the steps that installed the Receiver on omarchy (Arch, systemd, Node 25 from mise, t3 v0.0.45) on 2026-10-12.

Prerequisites: Node 22 or newer, T3 Code running on loopback port 3773, Tailscale with HTTPS certificates enabled for the tailnet, and the Machine's T3 Code projects cloned with an `origin` remote and an `origin/HEAD` ref (`git remote set-head origin --auto` if missing). The Receiver runs `git fetch` as a service with no TTY or SSH agent. If that fetch cannot authenticate (an SSH key with a passphrase, say), Threads still start, but from the local default branch with a note that the base may be stale.

## 1. Install the code

The service runs from its own clone so that switching branches in a working checkout does not change the running Receiver.

```sh
git clone https://github.com/anovoselnik/t3-feedback.git ~/.local/share/t3-feedback
```

To update later: `git -C ~/.local/share/t3-feedback pull --ff-only && systemctl --user restart t3-feedback-receiver`.

## 2. Mint the token

The token carries every T3 Code scope, so it stays in a file only you can read. It expires, so the TTL is set on purpose; mint a new one before it runs out.

```sh
(umask 077; mkdir -p ~/.config/t3-feedback && t3 auth session issue --label t3-feedback --ttl 365d --token-only > ~/.config/t3-feedback/token)
```

`t3 auth session list` shows it with client `t3-feedback | bot` and its expiry.

## 3. Write the config

`~/.config/t3-feedback/config.json` is the default path; `receiver/config.example.json` shows the keys, and `port` (default 7777) and `fallbackModelSelection` (default Opus 5.5, medium effort) can be left out. `tailscaleLogin` is the login name Tailscale Serve puts in the `Tailscale-User-Login` header; `tailscale status --json | jq -r '.User[(.Self.UserID|tostring)].LoginName'` prints it. `webUiBaseUrl` is where this Machine's T3 Code web UI is reachable on the tailnet.

```sh
(umask 077; cat > ~/.config/t3-feedback/config.json) <<'EOF'
{
  "machine": "omarchy",
  "tailscaleLogin": "you@example.com",
  "tokenPath": "~/.config/t3-feedback/token",
  "t3BaseUrl": "http://127.0.0.1:3773",
  "webUiBaseUrl": "https://omarchy.tail8fd60a.ts.net",
  "allowedOrigins": ["https://staging.cajanka.hr", "https://*.local", "http://*.local"]
}
EOF
```

## 4. Install the systemd user service

`receiver/t3-feedback-receiver.service` starts the Receiver when you log in and restarts it 5 seconds after any failure. It finds `node` on a PATH that includes the mise shims; edit the `Environment=PATH=` line if Node lives elsewhere.

```sh
mkdir -p ~/.config/systemd/user
cp ~/.local/share/t3-feedback/receiver/t3-feedback-receiver.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now t3-feedback-receiver
journalctl --user -u t3-feedback-receiver -f
```

The log shows `T3 Code environment <id>` and `Receiver for omarchy listening on http://127.0.0.1:7777`. If T3 Code is not up yet, the Receiver logs a warning and looks the environment up again on the first Feedback.

A user service runs while you are logged in. To keep the Receiver up after logout and start it at boot, run `loginctl enable-linger`.

## 5. Expose it with Tailscale Serve

Serve listens on the tailnet address on port 7777 and proxies to loopback 7777, so the two do not collide. It is tailnet only, not Funnel.

```sh
tailscale serve --bg --https=7777 http://127.0.0.1:7777
tailscale serve status
```

To remove it: `tailscale serve --https=7777 off`.

## 6. Check it from another host on the tailnet

```sh
R=https://omarchy.tail8fd60a.ts.net:7777
curl -w ' [%{http_code}]\n' $R/health
# {"machine":"omarchy","t3Reachable":true} [200]

curl -w ' [%{http_code}]\n' -H 'Origin: https://evil.example' $R/health
# {"error":"Origin https://evil.example is not allowed"} [403]

curl $R/feedback -F project=anovoselnik/t3-feedback -F machine=omarchy \
  -F 'message=Smoke test: reply "ok" and make no changes.' \
  -F pageUrl=https://staging.example.local/ -F viewport=1280x800 \
  -F 'image=@screenshot.png;type=image/png'
# {"threadId":"…","threadUrl":"https://omarchy.tail8fd60a.ts.net/<environment>/<thread>"}
```

The `threadUrl` opens the Thread in any browser already paired with that T3 Code environment.

What the identity check does over the tailnet:

- Serve sets `Tailscale-User-Login` from the caller's tailnet identity and overwrites any value the client sends, so a forged header is replaced with the real login.
- A tailnet caller whose login is not `tailscaleLogin` gets 403 `Tailscale identity <login> is not allowed`.
- A request that skips Serve and hits `127.0.0.1:7777` directly has no identity header and gets 401.
