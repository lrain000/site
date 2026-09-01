/* Renders the artist-editable parts of the site from content/*.json.

   Everything here runs in the browser — there is deliberately no build step,
   so the pages stay hand-written HTML and the JSON is fetched at load. The
   CMS at /admin writes those JSON files; Cloudflare redeploys on commit.

   Fails soft throughout: if a fetch fails, whatever markup is already in the
   page is left alone rather than being blanked out. */
(function () {
  'use strict';

  var SOCIAL_JSON = '/content/social.json';
  var SHOP_JSON   = '/content/shop.json';
  var HOME_JSON   = '/content/home.json';

  /* Used only if social.json is missing or malformed. The icon row used to be
     hardcoded in every page, so losing it to one bad CMS save would be a
     regression — this keeps the floor at the four networks we shipped with. */
  var DEFAULT_SOCIALS = [
    { platform: 'instagram', url: 'https://www.instagram.com/turrelljames' },
    { platform: 'twitter',   url: 'https://x.com/lrain0000?lang=en' },
    { platform: 'youtube',   url: 'https://www.youtube.com/@lrain' },
    { platform: 'spotify',   url: 'https://open.spotify.com/artist/68BVYIej5jGdIh8au5qELn' }
  ];

  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' -> ' + r.status);
      return r.json();
    });
  }

  /* ── Socials ─────────────────────────────────────────────────────────
     Replaces the icon row on every page. Platform names map to artwork in
     social-icons.js, so a new network needs a URL and a key, not markup. */
  function renderSocials(data) {
    var host = document.querySelector('.socials');
    if (!host || !data || !Array.isArray(data.socials)) return;

    var icons = window.SOCIAL_ICONS || {};
    var frag = document.createDocumentFragment();
    var added = 0;

    data.socials.forEach(function (s) {
      var icon = icons[(s.platform || '').toLowerCase()];
      if (!icon || !s.url) return;          // unknown platform: skip, don't break the row

      var a = document.createElement('a');
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.setAttribute('aria-label', s.label || icon.label);
      a.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                    '<path d="' + icon.path + '"></path></svg>';
      frag.appendChild(a);
      added++;
    });

    if (added) host.replaceChildren(frag);   // only swap once we have something to show
  }

  /* ── Shop ────────────────────────────────────────────────────────────
     Builds the featured release and the catalogue sections, then hands the
     product IDs to the Ochre embed. featured.enabled:false drops the hero
     entirely, which is how the shop stops leading with an off-cycle record. */
  function renderShop(data) {
    var featuredHost  = document.getElementById('shop-featured');
    var catalogueHost = document.getElementById('shop-catalogue');
    if (!featuredHost || !catalogueHost || !data) return [];

    var lists = [];   // [selector, ids] pairs to hand to Ochre
    var f = data.featured;

    if (f && f.enabled !== false && f.productIds && f.productIds.length) {
      var sec = document.createElement('section');
      sec.className = 'featured';
      var html = '';
      if (f.cover)    html += '<img class="cover" src="' + f.cover + '" alt="' + (f.title || '') + ' album cover">';
      if (f.wordmark) html += '<img class="wm-release" src="' + f.wordmark + '" alt="' + (f.title || '') + '">';
      else if (f.title) html += '<h2 class="release-title">' + f.title + '</h2>';
      if (f.note)     html += '<p class="release-note">' + f.note + '</p>';
      html += '<div class="panel" style="width:100%"><div class="ochre-list-featured"></div></div>';
      sec.innerHTML = html;
      featuredHost.appendChild(sec);
      lists.push(['.ochre-list-featured', f.productIds]);
    }

    var sections = (data.sections || []).filter(function (s) {
      return s && s.productIds && s.productIds.length;
    });

    if (sections.length) {
      var wrap = document.createElement('section');
      wrap.className = 'catalogue';
      var inner = '';
      if (data.catalogueHeading) {
        inner += '<h2 class="section-heading">' + data.catalogueHeading + '</h2>';
      }
      sections.forEach(function (s, i) {
        var cls = 'ochre-list-sec' + i;
        inner += '<div class="release">' +
                   '<div class="release-head">' +
                     (s.art ? '<img class="release-art" src="' + s.art + '" alt="' + (s.title || '') + ' album cover" width="500" height="500">' : '') +
                     '<h3 class="release-title">' + (s.title || '') + '</h3>' +
                   '</div>' +
                   '<div class="panel"><div class="' + cls + '"></div></div>' +
                 '</div>';
        lists.push(['.' + cls, s.productIds]);
      });
      wrap.innerHTML = inner;
      catalogueHost.appendChild(wrap);
    }

    return lists;
  }

  /* The Ochre library loads on its own schedule, so wait for it rather than
     assuming it is ready by the time the JSON arrives. */
  function whenOchreReady(timeoutMs) {
    return new Promise(function (resolve) {
      if (typeof window.buy !== 'undefined') return resolve(true);
      var waited = 0;
      var t = setInterval(function () {
        if (typeof window.buy !== 'undefined') { clearInterval(t); resolve(true); }
        else if ((waited += 100) >= timeoutMs) { clearInterval(t); resolve(false); }
      }, 100);
    });
  }

  function initOchre(lists) {
    if (!lists.length) return;
    whenOchreReady(8000).then(function (ready) {
      if (!ready) {
        var fb = document.getElementById('embed-fallback');
        if (fb) fb.className = 'show';
        document.body.classList.add('embed-unavailable');
        return;
      }
      lists.forEach(function (entry) {
        try { buy.products(entry[0], { style: 'mini' }).get(entry[1]); }
        catch (e) { console.error('Ochre list failed for ' + entry[0], e); }
      });
      try { buy.cart('.ochre-cart-container'); } catch (e) { console.error('Ochre cart failed', e); }
    });
  }

  /* ── Splash ──────────────────────────────────────────────────────────
     A full-screen photo or video shown before the homepage. Off unless the
     artist team enables it and uploads media, so the default is no change.

     Shown once per browsing session — sessionStorage, not localStorage, so
     it returns on a genuine revisit but not when moving between pages. Any
     click, tap or key dismisses it, and a video also dismisses when it ends.
     Skipped entirely for prefers-reduced-motion when the media is video. */
  function renderSplash(data) {
    var host = document.getElementById('splash');
    var s = data && data.splash;
    if (!host || !s || s.enabled === false) return;

    var isVideo = s.type === 'video' && s.video;
    var media   = isVideo ? s.video : s.image;
    if (!media) return;

    if (isVideo && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (!s.image) return;                       // nothing safe to show
      isVideo = false; media = s.image;           // fall back to the poster still
    }

    try {
      if (sessionStorage.getItem('splash-seen')) return;
    } catch (e) { /* private mode: just show it */ }

    host.innerHTML = isVideo
      ? '<video class="splash-media" src="' + media + '" autoplay muted playsinline' +
        (s.image ? ' poster="' + s.image + '"' : '') + '></video>'
      : '<img class="splash-media" src="' + media + '" alt="">';
    host.hidden = false;
    document.body.classList.add('splash-open');

    function dismiss() {
      if (host.hidden) return;
      host.hidden = true;
      host.innerHTML = '';
      document.body.classList.remove('splash-open');
      try { sessionStorage.setItem('splash-seen', '1'); } catch (e) {}
      document.removeEventListener('keydown', dismiss);
    }

    host.addEventListener('click', dismiss);
    document.addEventListener('keydown', dismiss);
    var vid = host.querySelector('video');
    if (vid) vid.addEventListener('ended', dismiss);
    if (s.autoDismissSeconds) setTimeout(dismiss, s.autoDismissSeconds * 1000);
  }

  /* ── Boot ─────────────────────────────────────────────────────────── */
  getJSON(SOCIAL_JSON)
    .then(renderSocials)
    .catch(function (e) {
      console.warn('social.json unavailable, using defaults —', e.message);
      renderSocials({ socials: DEFAULT_SOCIALS });
    });

  if (document.getElementById('splash')) {
    getJSON(HOME_JSON)
      .then(renderSplash)
      .catch(function (e) { console.warn('home.json unavailable —', e.message); });
  }

  if (document.getElementById('shop-featured')) {
    getJSON(SHOP_JSON)
      .then(function (d) { initOchre(renderShop(d)); })
      .catch(function (e) {
        console.error('shop content failed to load', e);
        var fb = document.getElementById('embed-fallback');
        if (fb) fb.className = 'show';
      });
  }
})();
