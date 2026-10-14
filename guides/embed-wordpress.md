# Add the button to a WordPress site

Add this to your theme's `functions.php`, or to a file it includes. It prints the script tag on front-end and wp-admin pages, but only when the site's host is your staging host or ends in `.local`.

```php
function t3_feedback_widget() {
    $host = (string) wp_parse_url( home_url(), PHP_URL_HOST );
    if ( 'staging.example.com' !== $host && ! str_ends_with( $host, '.local' ) ) return;
    wp_print_script_tag( array(
        'src'           => 'https://cdn.jsdelivr.net/gh/anovoselnik/t3-feedback@latest/widget/t3-feedback.js',
        'data-project'  => 'your-github-user/your-theme',
        'data-machines' => wp_json_encode( array(
            'desktop' => 'https://desktop.tail1234.ts.net:7777',
            'laptop'  => 'https://laptop.tail1234.ts.net:7777',
        ) ),
    ) );
}
add_action( 'wp_footer', 't3_feedback_widget' );
add_action( 'admin_footer', 't3_feedback_widget' );
```

Replace the staging host, the project slug, and the machines with your own. The machine names must match the `machine` value in each receiver's config.

The check reads the host from `home_url()`, not from the request. A forged `Host` header therefore can't put the tag on a cached production page. It checks the hostname rather than an environment constant because `wp-config.php` usually lives outside the theme's repository.

Add `https://staging.example.com` and `https://*.local` to `allowedOrigins` on every machine, then restart each receiver.
