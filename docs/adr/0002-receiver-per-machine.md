---
status: accepted
---

# A Receiver on each Machine instead of calling T3 Code from the page

T3 Code's server accepts cross-origin requests, so the Widget could post straight to its dispatch endpoint. We put a small Receiver in front of it on every Machine anyway, because the only credential T3 Code issues on this build carries every scope, and a public staging page cannot hold it. The Receiver keeps the token on disk, binds to loopback so every request arrives through Tailscale Serve, trusts the Tailscale login header for identity, enforces an origin allowlist, resolves the Project slug, and shapes the dispatch command.

## Considered options

- Direct to T3 Code: fewest parts, but an admin token in page source and no place for slug resolution.
- One central Receiver on a single Machine that forwards to the others: fewer services but a single point of failure, and the "pick a Machine" choice would still need per-Machine reachability.
