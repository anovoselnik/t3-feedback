# Release the widget

Staging pages load the widget from jsDelivr at a release tag, never from a branch:

```
https://cdn.jsdelivr.net/gh/anovoselnik/t3-feedback@v0.2.0/widget/t3-feedback.js
```

jsDelivr caches a tagged file permanently, so a change to `widget/` reaches a staging page only when its embed URL moves to a new tag. To release one:

1. Merge the widget change to `main`.
2. Tag `main` with the next version and push the tag. Never move or reuse a tag, because jsDelivr would keep serving the old file.

   ```sh
   git fetch origin
   git tag -a v0.3.0 -m "v0.3.0: <what changed>" origin/main
   git push origin v0.3.0
   ```

3. Check that jsDelivr serves the new file as JavaScript. Expect `HTTP/2 200` and a `content-type` starting with `application/javascript`:

   ```sh
   curl -sI https://cdn.jsdelivr.net/gh/anovoselnik/t3-feedback@v0.3.0/widget/t3-feedback.js
   ```

4. Set `WIDGET_RELEASE` in `test-page/serve.js` to the new tag, run `npm run test-page -- --jsdelivr`, and check that the test page works with the released file.
5. Move every embed URL in the docs to the new tag. `grep -rl '@v0.2.0' README.md guides docs` lists the files. Then update the script tag in each project that embeds the widget.
