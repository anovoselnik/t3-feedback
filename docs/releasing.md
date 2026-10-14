# Release the widget

Staging pages load the widget from jsDelivr at the major-version range `@0`:

```
https://cdn.jsdelivr.net/gh/anovoselnik/t3-feedback@0/widget/t3-feedback.js
```

jsDelivr resolves `@0` to the highest `v0.x.y` tag. A change to `widget/` reaches staging pages only when you tag a release, never from a branch. To release one:

1. Merge the widget change to `main`.
2. Tag `main` with the next version and push the tag. Never move or reuse a tag, because jsDelivr stores each tagged file permanently and would keep serving the old one.

   ```sh
   git fetch origin
   git tag -a v0.3.0 -m "v0.3.0: <what changed>" origin/main
   git push origin v0.3.0
   ```

3. Purge jsDelivr's cache of `@0`, so it serves the new release now rather than within 12 hours:

   ```sh
   curl -s https://purge.jsdelivr.net/gh/anovoselnik/t3-feedback@0/widget/t3-feedback.js
   ```

4. Check that `@0` resolves to the new tag. Expect `HTTP/2 200`, a `content-type` starting with `application/javascript`, and `x-jsd-version: 0.3.0`:

   ```sh
   curl -sI https://cdn.jsdelivr.net/gh/anovoselnik/t3-feedback@0/widget/t3-feedback.js
   ```

5. Run `npm run test-page -- --jsdelivr` and check that the test page works with the released file.

Browsers cache the `@0` file for up to 7 days, so a page you visited before the release may keep the old widget until you hard-reload it.

## Breaking changes

A change that breaks existing embeds, such as renaming a `data-` attribute, is a new major version. Tag it `v1.0.0` and change `@0` to `@1` in the README, the guides, and `test-page/serve.js`. Existing sites stay on the last 0.x release until their embed moves to `@1`.
