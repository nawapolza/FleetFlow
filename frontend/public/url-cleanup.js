/* Removes share-tracking parameters from the address bar without navigating or
 * dropping application parameters. Runs before the React bundle on every page.
 * Facebook may attach fbclid when a link is clicked; it is removed on load. */
(function () {
  try {
    var url = new URL(window.location.href);
    var trackingNames = new Set([
      'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid',
      'igshid', 'mibextid', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi'
    ]);
    var changed = false;
    Array.from(url.searchParams.keys()).forEach(function (key) {
      if (trackingNames.has(key.toLowerCase()) || /^utm_/i.test(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    });
    if (!changed) return;
    var cleaned = url.pathname + url.search + url.hash;
    window.history.replaceState(window.history.state, '', cleaned);
  } catch (_) {
    // Browsing and authentication must continue even if URL cleaning fails.
  }
})();
