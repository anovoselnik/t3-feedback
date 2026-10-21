# Troubleshooting

## The button doesn't show

The button appears only after one of your machines answers within 4 seconds. Check these in order:

1. Your device is on your tailnet.
2. `curl https://<machine>.<tailnet>.ts.net:7777/health` answers from that device. If not, check the receiver's log and `tailscale serve status` on the machine.
3. The staging origin is in the machine's `allowedOrigins`. The browser console shows a CORS error if it isn't.
4. The browser hasn't blocked local network access for the site. See the next section.
5. The script tag has no `type="module"`.

## Sending fails with "speaks orchestration protocol"

T3 Code and the receiver on that machine disagree about T3 Code's API. The message names the side to update: T3 Code itself, or the receiver (pull this repository on the machine and restart the service). `/health` shows the same thing as `t3Protocol` and `t3Compatible`.

## The browser asks about local network access

Chrome 142+ and Firefox 151+ treat Tailscale addresses as local. The first time a staging site loads the button, the browser asks whether the site may reach devices on your local network. Allow it. Safari doesn't ask.

If you answer after 4 seconds, the button stays hidden until the next page load.

If you denied it, the browser remembers that for the site and the button never appears there. To undo it, click the icon at the left of the address bar on the staging page. In Chrome, open Site settings and set local network access back to Ask or Allow. In Firefox, clear the permission in the panel. Then reload.

## Visitors off the tailnet

Visitors who aren't on your tailnet can't reach any receiver, so the button never appears for them. Usually the probe fails at once because tailnet hostnames don't resolve on the public internet. If a machine has Funnel enabled for something else, its hostname resolves publicly and the probe hangs instead. The 4-second timeout still keeps the button hidden.

## "No T3 Code project for owner/name"

The machine you picked has no T3 Code project whose `origin` remote matches the slug in `data-project`. Clone the repository on that machine and add it to T3 Code.

## The receiver rejects a project for a missing `origin/HEAD`

Run `git remote set-head origin --auto` in that project's clone.

## The thread says the base branch may be stale

The receiver runs `git fetch` before it creates the worktree. When the fetch fails, the receiver still starts the thread from your local default branch and adds a note saying so. The fetch fails most often because the background service can't use your SSH key, for example when the key has a passphrase. Use an HTTPS remote with a credential helper, or a key without a passphrase.

## 401 or 403 from the receiver

- 401 means the request didn't come through Tailscale Serve. Use the `https://...ts.net:7777` address, not `127.0.0.1:7777`.
- 403 with "Tailscale identity" means you're signed in to Tailscale as someone other than `tailscaleLogin`.
- 403 with "Origin" means the staging origin isn't in `allowedOrigins`.

## "Open thread" goes to a pairing page

That browser hasn't been paired with the machine's T3 Code yet. Pair it once and the link opens the thread.

## The token expired

Create a new one with the command from your machine guide, then restart the receiver. `t3 auth session list` shows when the current token expires.
