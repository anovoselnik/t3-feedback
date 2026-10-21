# Set up a machine on Linux

This guide installs the receiver as a systemd user service and exposes it on your tailnet with Tailscale Serve. Repeat it on every Linux machine that should take feedback. Needs T3 Code 0.1.0 or newer. Tested on Arch Linux with t3 v0.1.0.

## Before you start

You need:

- T3 Code running and listening on `127.0.0.1:3773`
- The `t3` CLI on your PATH
- Node 22 or newer
- Tailscale, with HTTPS certificates enabled for your tailnet
- `git` and `jq`

Each project needs an `origin` remote and an `origin/HEAD` ref in its clone. If the receiver rejects feedback for a project, run `git remote set-head origin --auto` in that clone.

## 1. Install the code

The service runs from its own clone. Switching branches in another checkout doesn't affect it.

```sh
git clone https://github.com/anovoselnik/t3-feedback.git ~/.local/share/t3-feedback
```

## 2. Create a T3 Code token

The token has full access to T3 Code, so only your user can read the file. It expires after one year. Create a new one before then.

```sh
(umask 077; mkdir -p ~/.config/t3-feedback && t3 auth session issue --label t3-feedback --ttl 365d --token-only > ~/.config/t3-feedback/token)
```

`t3 auth session list` shows the token and when it expires.

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
  "machine": "desktop",
  "tailscaleLogin": "you@github",
  "tokenPath": "~/.config/t3-feedback/token",
  "webUiBaseUrl": "https://desktop.tail1234.ts.net",
  "allowedOrigins": ["https://staging.example.com", "https://*.local"]
}
EOF
```

- `machine` is the name the button shows. Use the same name in your site's `data-machines` map.
- `tailscaleLogin` is the login from the first command.
- `webUiBaseUrl` is the address of this machine's T3 Code web UI on your tailnet. "Open thread" links point here. If nothing serves T3 Code there yet, run `tailscale serve --bg http://127.0.0.1:3773`.
- `allowedOrigins` lists your staging sites. `*` matches anything except `/`.

[receiver/config.example.json](../receiver/config.example.json) shows the optional keys: `port` (default 7777), `t3BaseUrl` (default `http://127.0.0.1:3773`), and `fallbackModelSelection`, the model used when the project has no default in T3 Code.

## 4. Install the service

The service file looks for `node` in the mise shims, `/usr/local/bin`, and `/usr/bin`. If your Node 22+ is somewhere else, edit the `Environment=PATH=` line after copying it.

```sh
mkdir -p ~/.config/systemd/user
cp ~/.local/share/t3-feedback/receiver/t3-feedback-receiver.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now t3-feedback-receiver
journalctl --user -u t3-feedback-receiver -f
```

The log should show `Receiver for <machine> listening on http://127.0.0.1:7777`.

A user service runs only while you're logged in. To keep it running after logout and start it at boot, run `loginctl enable-linger`.

## 5. Expose it on your tailnet

```sh
tailscale serve --bg --https=7777 http://127.0.0.1:7777
```

If this fails with "access denied", run `sudo tailscale set --operator=$USER` once and try again.

Use Serve only. Funnel would expose the receiver to the internet.

## 6. Check it

From this machine or any other device on your tailnet:

```sh
curl https://desktop.tail1234.ts.net:7777/health
# {"machine":"desktop","t3Reachable":true,"t3Protocol":2,"t3Compatible":true}
```

If `t3Reachable` is false, T3 Code isn't running or `t3BaseUrl` is wrong. If `t3Compatible` is false, T3 Code and the receiver speak different orchestration protocols: this receiver needs protocol 2 (T3 Code 0.1 or newer). Update whichever side is older.

To send a test feedback without a staging site, use the slug of a project that T3 Code has on this machine:

```sh
curl https://desktop.tail1234.ts.net:7777/feedback \
  -F project=your-github-user/your-repo -F machine=desktop \
  -F 'message=Smoke test: reply "ok" and make no changes.' \
  -F pageUrl=https://staging.example.com/ -F viewport=1280x800
```

It returns a `threadUrl`. Open it to see the new thread.

## Update

```sh
git -C ~/.local/share/t3-feedback pull --ff-only && systemctl --user restart t3-feedback-receiver
```

## Next

[Add the button to your staging site](../README.md#set-up).
