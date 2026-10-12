# t3-feedback

Send UI feedback from a staging page straight into a T3 Code thread on one of your machines.

A **Widget** on the staging page collects a message and a screenshot. A **Receiver** on each **Machine** (reachable over your tailnet) turns that **Feedback** into a new T3 Code **Thread** in a fresh worktree of the matching **Project**.

Status: the Receiver is in [receiver/](receiver/) (Node 22+, `npm test`) and runs as a service on Linux ([docs/setup-linux.md](docs/setup-linux.md)). The Widget is in [widget/](widget/): it probes every configured Machine, offers the online ones in a chooser that remembers the last one used per site, and sends Feedback with an optional screenshot, pasted or picked. To try it without a Machine, run `npm run test-page` and open http://localhost:7779: the page embeds the Widget against an echo Receiver that shows each Feedback instead of opening a Thread. Start with:

- [CONTEXT.md](CONTEXT.md): the vocabulary.
- [docs/PRD.md](docs/PRD.md): what to build and why.
- [docs/adr/](docs/adr/): the two decisions that are not obvious from the code.

Embed snippets and Receiver setup will land here as the tickets are implemented.

## Releasing the Widget

Staging pages load the Widget from jsDelivr at a release tag, never from a branch:

```
https://cdn.jsdelivr.net/gh/anovoselnik/t3-feedback@v0.1.0/widget/t3-feedback.js
```

jsDelivr caches a tagged file for good, so a change to `widget/` reaches a Staging page only when its embed URL moves to a new tag. To release one:

1. Merge the Widget change to `main`.
2. Tag `main` with the next version and push the tag. Never move or reuse a tag: jsDelivr would keep serving the old file.

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
5. Move the remaining embed URLs to the new tag: the URL in this README and each Project's script tag (the Cajanka theme's footer hook).
