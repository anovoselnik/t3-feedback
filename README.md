# t3-feedback

Send UI feedback from a staging page straight into a T3 Code thread on one of your machines.

A Widget on a Staging page collects a message and an optional screenshot. A Receiver on each Machine accepts that Feedback over the tailnet and opens a new T3 Code Thread for it, in a fresh worktree of the matching Project. The Widget probes every configured Machine when the page loads and shows its "Send feedback" button only if at least one answers.

- [CONTEXT.md](CONTEXT.md) defines the vocabulary.
- [docs/PRD.md](docs/PRD.md) says what to build and why.
- [docs/adr/](docs/adr/) records the two decisions the code does not explain.

The Receiver is in [receiver/](receiver/). The Widget is a single dependency-free script, [widget/t3-feedback.js](widget/t3-feedback.js).

## Set up a Machine

A Machine needs:

- Node 22 or newer.
- T3 Code listening on loopback port 3773. On macOS the T3 Code desktop app does this.
- Tailscale with HTTPS certificates enabled for the tailnet. On macOS, use the Tailscale app.
- Git. On macOS it comes from the Xcode Command Line Tools (`xcode-select --install`).
- Each T3 Code project cloned with an `origin` remote and an `origin/HEAD` ref. The Receiver refuses Feedback for a Project whose clone lacks the ref. Run `git remote set-head origin --auto` in that clone to add it.

The Receiver runs `git fetch` as a background service, with no TTY or SSH agent. If the fetch cannot authenticate (an SSH key with a passphrase, for example), Threads still start, but from the local default branch, with a note in the Thread that the base may be stale.

On macOS, keep the projects out of `~/Documents`, `~/Desktop` and `~/Downloads`. macOS blocks a background `node` from those folders until you grant it Full Disk Access.

These steps were tested on 2026-10-12 on two Machines with t3 v0.0.45: `omarchy` (Arch Linux, systemd, Node 25 from mise) and `macbook` (macOS 26.7, Tailscale app 1.104.1, Node 24.18.1 from nodenv).

### 1. Install the code

The service runs from its own clone, so switching branches in a working checkout does not change the running Receiver.

```sh
git clone https://github.com/anovoselnik/t3-feedback.git ~/.local/share/t3-feedback
```

### 2. Mint the token

The token carries every T3 Code scope, so it lives in a file only you can read. Tokens expire. The command below sets a one-year TTL; mint a new token before it runs out.

On Linux:

```sh
(umask 077; mkdir -p ~/.config/t3-feedback && t3 auth session issue --label t3-feedback --ttl 365d --token-only > ~/.config/t3-feedback/token)
```

On macOS, the desktop app does not put `t3` on the PATH, so run the CLI through npx. With no `--base-dir`, it reads `~/.t3`, where the desktop app keeps its state. If your T3 Code keeps its data elsewhere, pass that directory with `--base-dir`. Without it, the token belongs to an environment the running T3 Code does not know.

```sh
(umask 077; mkdir -p ~/.config/t3-feedback && npx -y t3@0.0.45 auth session issue --label t3-feedback --ttl 365d --token-only > ~/.config/t3-feedback/token)
```

`t3 auth session list` (or `npx -y t3@0.0.45 auth session list`) shows the token with client `t3-feedback | bot` and its expiry.

### 3. Write the config

The Receiver reads `~/.config/t3-feedback/config.json`. [receiver/config.example.json](receiver/config.example.json) shows every key.

- `machine` is this Machine's label. It must match the key for this Machine in the Widget's `data-machines` map.
- `tailscaleLogin` is the login that Tailscale Serve puts in the `Tailscale-User-Login` header. `tailscale status --json | jq -r '.User[(.Self.UserID|tostring)].LoginName'` prints it.
- `webUiBaseUrl` is the address of this Machine's T3 Code web UI on the tailnet. The Receiver builds Thread links from it.
- `allowedOrigins` lists the Staging page origins that may send Feedback. A `*` matches any run of characters except `/`, so `https://*.local` covers every `.local` host over HTTPS.
- `port` defaults to 7777 and `fallbackModelSelection` defaults to Opus 5.5 at medium effort. Leave both out unless you need something else.

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

If `webUiBaseUrl` has no Tailscale Serve route yet, add one that proxies to T3 Code: `tailscale serve --bg http://127.0.0.1:3773`.

### 4. Install the service

#### Linux: systemd user service

[receiver/t3-feedback-receiver.service](receiver/t3-feedback-receiver.service) starts the Receiver when you log in and restarts it 5 seconds after any failure. It looks for `node` on a PATH that includes the mise shims. If Node lives elsewhere, edit the `Environment=PATH=` line.

```sh
mkdir -p ~/.config/systemd/user
cp ~/.local/share/t3-feedback/receiver/t3-feedback-receiver.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now t3-feedback-receiver
journalctl --user -u t3-feedback-receiver -f
```

A user service runs only while you are logged in. To keep the Receiver up after logout and start it at boot, run `loginctl enable-linger`.

To update the Receiver later:

```sh
git -C ~/.local/share/t3-feedback pull --ff-only && systemctl --user restart t3-feedback-receiver
```

#### macOS: launchd agent

[receiver/t3-feedback-receiver.plist](receiver/t3-feedback-receiver.plist) starts the Receiver when you log in and starts it again whenever it exits with an error or gets killed. launchd waits at least 5 seconds between starts, so a crash loop stays slow.

launchd expands neither `~` nor `$HOME`, so the install fills in two placeholders: `__HOME__`, and `__NODE__`, the absolute path of a Node 22+ binary. Don't point `__NODE__` at a version-manager shim like `~/.nodenv/shims/node`. A shim picks the Node version from the working directory or a global setting, and that version can be older than 22.

```sh
NODE=$(nodenv prefix 24.18.1)/bin/node   # or /opt/homebrew/bin/node, or wherever your Node 22+ lives
"$NODE" --version                        # must print v22 or newer

PLIST=~/Library/LaunchAgents/com.github.anovoselnik.t3-feedback-receiver.plist
sed -e "s|__HOME__|$HOME|g" -e "s|__NODE__|$NODE|g" \
  ~/.local/share/t3-feedback/receiver/t3-feedback-receiver.plist > "$PLIST"
plutil -lint "$PLIST"
launchctl bootstrap gui/$(id -u) "$PLIST"
tail -f ~/Library/Logs/t3-feedback-receiver.log
```

macOS shows a "Background Items Added" notification the first time. The agent then appears under System Settings > General > Login Items & Extensions, where you can turn it off.

Other commands:

- Status: `launchctl print gui/$(id -u)/com.github.anovoselnik.t3-feedback-receiver | grep -E 'state|pid|last exit'`
- Restart: `launchctl kickstart -k gui/$(id -u)/com.github.anovoselnik.t3-feedback-receiver`
- Remove: `launchctl bootout gui/$(id -u)/com.github.anovoselnik.t3-feedback-receiver && rm "$PLIST"`
- Update: `git -C ~/.local/share/t3-feedback pull --ff-only`, then restart.

After editing the plist, run `bootout` and then `bootstrap` again, because `kickstart` keeps the old definition. If `bootstrap` fails with `5: Input/output error`, the old job is still shutting down. Run it again.

launchd does not rotate `~/Library/Logs/t3-feedback-receiver.log`. Truncate it by hand if it grows.

A LaunchAgent runs only while you are logged in, and a sleeping laptop answers nothing. The Widget's probe then times out and leaves the laptop out of the chooser.

#### Check the log

On either system, the log shows `T3 Code environment <id>` and `Receiver for <machine> listening on http://127.0.0.1:7777`. If T3 Code is not up yet, the Receiver logs a warning and looks the environment up again on the first Feedback.

### 5. Expose it with Tailscale Serve

The Receiver listens on loopback only. Tailscale Serve listens on the tailnet address on port 7777 and proxies to loopback port 7777, so the two do not collide. Serve keeps the Receiver on the tailnet; never expose it with Funnel.

```sh
tailscale serve --bg --https=7777 http://127.0.0.1:7777
tailscale serve status
```

To remove the route: `tailscale serve --https=7777 off`.

On macOS, Serve runs only while the Tailscale app is connected. The app installs `/usr/local/bin/tailscale` as a wrapper around its own CLI. If `tailscale` is not on your PATH, use the app's "Install CLI" setting, or run `/Applications/Tailscale.app/Contents/MacOS/tailscale` instead.

### 6. Check it from another host on the tailnet

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

The `threadUrl` opens the Thread in any browser already paired with that T3 Code environment. An unpaired browser goes to `/pair` first.

How the identity check behaves over the tailnet:

- Serve sets `Tailscale-User-Login` from the caller's tailnet identity and overwrites any value the client sends, so a forged header gets replaced with the real login.
- A tailnet caller whose login is not `tailscaleLogin` gets 403 `Tailscale identity <login> is not allowed`.
- A request that skips Serve and goes straight to `127.0.0.1:7777` has no identity header and gets 401.

## Embed the Widget

A Staging page loads the Widget with one classic `<script>` tag from jsDelivr, pinned to a release tag. The Widget reads its settings from that tag's attributes:

- `data-project` is the Project's GitHub slug, `owner/name`.
- `data-machines` is a JSON map from each Machine's label to its Receiver URL. The labels must match each Receiver's `machine` config. The chooser lists Machines in this order.

The Widget finds its tag through `document.currentScript`. That property is null inside a module, so don't add `type="module"`. Show the Widget on Staging pages only, and add each Staging page's origin to `allowedOrigins` on every Machine.

### WordPress

Add this to the theme's `functions.php`. It prints the tag in the footer of front-end and wp-admin pages, but only when the site's host is `staging.cajanka.hr` or ends in `.local`. The check uses the hostname because staging's `wp-config.php` is not in the theme's repository. It reads the host from `home_url()` rather than the request's `Host` header, so a forged header cannot put the tag on a cached production page. The Cajanka theme's version is `inc/t3-feedback.php` in `anovoselnik/cajanka-wp-theme`.

```php
function t3_feedback_widget() {
    $host = wp_parse_url( home_url(), PHP_URL_HOST );
    if ( 'staging.cajanka.hr' !== $host && ! str_ends_with( $host, '.local' ) ) return;
    wp_print_script_tag( array(
        'src'           => 'https://cdn.jsdelivr.net/gh/anovoselnik/t3-feedback@v0.1.0/widget/t3-feedback.js',
        'data-project'  => 'anovoselnik/cajanka-wp-theme',
        'data-machines' => wp_json_encode( array( 'omarchy' => 'https://omarchy.tail8fd60a.ts.net:7777', 'macbook' => 'https://antonios-laptop.tail8fd60a.ts.net:7777' ) ),
    ) );
}
add_action( 'wp_footer', 't3_feedback_widget' );
add_action( 'admin_footer', 't3_feedback_widget' );
```

### Rails

Put this before `</body>` in `app/views/layouts/application.html.erb`. It assumes the staging deploy runs with `RAILS_ENV=staging`.

```erb
<% if Rails.env.staging? %><script src="https://cdn.jsdelivr.net/gh/anovoselnik/t3-feedback@v0.1.0/widget/t3-feedback.js" data-project="owner/name" data-machines='{"omarchy": "https://omarchy.tail8fd60a.ts.net:7777", "macbook": "https://antonios-laptop.tail8fd60a.ts.net:7777"}'></script><% end %>
```

The Widget works with Turbo Drive without extra setup. It marks its host element `data-turbo-permanent`, so a Turbo visit keeps the open panel and its text. Turbo runs the script again after each visit, and the Widget ignores that second run, so it never shows twice.

### Vite

Put this in the app's entry module, such as `src/main.ts`. Vite has no way to leave a tag out of `index.html` for one environment, so the entry module adds the tag at runtime, and only on the staging hostname.

```js
if (location.hostname === "staging.example.com") {
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/gh/anovoselnik/t3-feedback@v0.1.0/widget/t3-feedback.js";
  script.dataset.project = "owner/name";
  script.dataset.machines = JSON.stringify({ omarchy: "https://omarchy.tail8fd60a.ts.net:7777", macbook: "https://antonios-laptop.tail8fd60a.ts.net:7777" });
  document.body.append(script);
}
```

## Browser permission prompt

Chrome 142+ and Firefox 151+ treat Tailscale addresses as local, so the Widget's first probe makes the browser ask once per Staging page origin whether the page may reach devices on your local network. Allow it. The probe waits for your answer for at most 4 seconds. If you answer later, the button stays hidden until the next page load or Turbo visit. Safari does not ask today.

If you deny the prompt, the browser remembers that for the origin, and the button never appears there again. To undo a denial, open the Staging page, click the icon at the left of the address bar, and reset the local network permission. In Chrome that is under Site settings, where you set it back to Ask or Allow. In Firefox the permission is listed in the panel the icon opens; clear it there. Then reload.

## Visitors off the tailnet

The Widget shows its button only when a probe of some Machine's `/health` succeeds within 4 seconds. A visitor who is not on your tailnet cannot reach any Receiver, so the button never appears for them.

For most Machines the probe fails right away, because the tailnet hostname does not resolve outside the tailnet. omarchy has Funnel enabled, so its tailnet hostname resolves publicly, and an off-tailnet probe hangs instead of failing. The probe's 4-second timeout is what keeps the Widget hidden there.

## Try it locally

`npm run test-page` starts the manual test page on http://localhost:7779. It also starts two Receivers in echo mode, `echo` on port 7778 and `echo2` on port 7780. An echo Receiver keeps each Feedback instead of opening a Thread. The Widget's "Open thread" link shows what it received, and the terminal logs each Feedback. The page configures a third Machine, `nowhere`, that never answers, so the button appears only after the 4-second probe timeout. The page itself lists what to check.

`npm run test-page -- --jsdelivr` loads the released Widget from jsDelivr instead of `widget/`.

`npm test` runs the Receiver's unit tests in [test/](test/) with Node's built-in test runner. They need neither T3 Code nor Tailscale.

## Release the Widget

Staging pages load the Widget from jsDelivr at a release tag, never from a branch:

```
https://cdn.jsdelivr.net/gh/anovoselnik/t3-feedback@v0.1.0/widget/t3-feedback.js
```

jsDelivr caches a tagged file permanently, so a change to `widget/` reaches a Staging page only when its embed URL moves to a new tag. To release one:

1. Merge the Widget change to `main`.
2. Tag `main` with the next version and push the tag. Never move or reuse a tag, because jsDelivr would keep serving the old file.

   ```sh
   git fetch origin
   git tag -a v0.2.0 -m "v0.2.0: <what changed>" origin/main
   git push origin v0.2.0
   ```

3. Check that jsDelivr serves the new file as JavaScript. Expect `HTTP/2 200` and a `content-type` starting with `application/javascript`:

   ```sh
   curl -sI https://cdn.jsdelivr.net/gh/anovoselnik/t3-feedback@v0.2.0/widget/t3-feedback.js
   ```

4. Set `WIDGET_RELEASE` in `test-page/serve.js` to the new tag, run `npm run test-page -- --jsdelivr`, and check that the test page works with the released file.
5. Move the remaining embed URLs to the new tag: every URL in this README, and each Project's script tag (for Cajanka, `inc/t3-feedback.php` in the theme).
