# Release the widget

Staging pages load the widget from jsDelivr at `@latest`:

```
https://cdn.jsdelivr.net/gh/anovoselnik/t3-feedback@latest/widget/t3-feedback.js
```

jsDelivr resolves `@latest` to the highest semver tag. A change to `widget/` reaches staging pages only when you tag a release, never from a branch. To release one:

1. Merge the widget change to `main`.
2. Tag `main` with the next version and push the tag. Never move or reuse a tag, because jsDelivr stores each tagged file permanently and would keep serving the old one.

   ```sh
   git fetch origin
   git tag -a v0.3.0 -m "v0.3.0: <what changed>" origin/main
   git push origin v0.3.0
   ```

3. Pushing the tag runs the [Release widget](../.github/workflows/release-widget.yml) workflow. It purges jsDelivr's cache of `@latest`, so the release goes live at once rather than within 12 hours, and passes once `@latest` serves the new tag as JavaScript. Watch it:

   ```sh
   gh run watch "$(gh run list --workflow release-widget.yml --limit 1 --json databaseId -q '.[0].databaseId')"
   ```

   If it fails, purge by hand with `curl -s https://purge.jsdelivr.net/gh/anovoselnik/t3-feedback@latest/widget/t3-feedback.js`, then check `x-jsd-version` in `curl -sI https://cdn.jsdelivr.net/gh/anovoselnik/t3-feedback@latest/widget/t3-feedback.js`.

4. Run `npm run test-page -- --jsdelivr` and check that the test page works with the released file.

Browsers cache the `@latest` file for up to 7 days, so a page you visited before the release may keep the old widget until you hard-reload it.

## Breaking changes

Every embed picks up a release as soon as it is tagged, so keep existing embeds working. When a change must break them, such as renaming a `data-` attribute, accept the old form as well for a while, and note the change in the tag message.
