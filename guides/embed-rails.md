# Add the button to a Rails app

Put this before `</body>` in `app/views/layouts/application.html.erb`. It assumes your staging deploy runs with `RAILS_ENV=staging`.

```erb
<% if Rails.env.staging? %>
  <script
    src="https://cdn.jsdelivr.net/gh/anovoselnik/t3-feedback@0/widget/t3-feedback.js"
    data-project="your-github-user/your-app"
    data-machines='{"desktop": "https://desktop.tail1234.ts.net:7777", "laptop": "https://laptop.tail1234.ts.net:7777"}'
  ></script>
<% end %>
```

Replace the project slug and the machines with your own. The machine names must match the `machine` value in each receiver's config.

The button works with Turbo Drive as is. It keeps an open panel and its text across Turbo visits, and it never shows twice.

Add your staging origin to `allowedOrigins` on every machine, then restart each receiver.
