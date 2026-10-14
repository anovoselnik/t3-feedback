# Add the button to a Vite app

This works for React, Vue, Svelte, or any other app built with Vite. Put it in the app's entry module, such as `src/main.ts`. It adds the script tag at runtime, and only on your staging hostname.

```js
if (location.hostname === "staging.example.com") {
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/gh/anovoselnik/t3-feedback@v0.2.0/widget/t3-feedback.js";
  script.dataset.project = "your-github-user/your-app";
  script.dataset.machines = JSON.stringify({
    desktop: "https://desktop.tail1234.ts.net:7777",
    laptop: "https://laptop.tail1234.ts.net:7777",
  });
  document.body.append(script);
}
```

Replace the staging hostname, the project slug, and the machines with your own. The machine names must match the `machine` value in each receiver's config.

Add your staging origin to `allowedOrigins` on every machine, then restart each receiver.
