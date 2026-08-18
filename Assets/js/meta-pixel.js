/* Meta (Facebook) Pixel — ID 537348656601210.
   Meta's standard snippet, kept here rather than inlined into every page.
   The matching <noscript> fallback image has to live in each page's markup,
   since by definition it only renders when JS is unavailable.

   Fires PageView on load. Note that purchases complete on
   lrain.ochre.store, a different domain, so this pixel cannot see them —
   conversion tracking would need the same pixel added on the Ochre store
   (Ochre supports tracking snippets in its settings). */
!function (f, b, e, v, n, t, s) {
  if (f.fbq) return;
  n = f.fbq = function () {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  };
  if (!f._fbq) f._fbq = n;
  n.push = n;
  n.loaded = !0;
  n.version = '2.0';
  n.queue = [];
  t = b.createElement(e);
  t.async = !0;
  t.src = v;
  s = b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t, s);
}(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

fbq('init', '537348656601210');
fbq('track', 'PageView');
