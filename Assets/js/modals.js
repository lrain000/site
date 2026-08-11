/* Shared modal behaviour for index.html, shop.html and tour.html.
   Wire a trigger with data-modal-open="<modal id>"; close via any
   [data-modal-close] element, the backdrop, or Escape.

   Third-party iframes are declared with data-iframe-src and injected on
   first open, so nothing is requested from an external host until the
   visitor actually asks for it. */
(function () {
  var openModal = null;
  var lastFocus = null;

  function focusables(root) {
    return [].filter.call(
      root.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, iframe, [tabindex]:not([tabindex="-1"])'),
      function (el) { return el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement; }
    );
  }

  function hydrate(modal) {
    // Inject any declared iframe exactly once
    var slots = modal.querySelectorAll('[data-iframe-src]');
    [].forEach.call(slots, function (slot) {
      var src = slot.getAttribute('data-iframe-src');
      slot.removeAttribute('data-iframe-src');
      var f = document.createElement('iframe');
      f.setAttribute('src', src);
      f.setAttribute('loading', 'lazy');
      f.setAttribute('allow', 'clipboard-write; fullscreen');
      f.setAttribute('allowfullscreen', '');
      f.setAttribute('title', slot.getAttribute('data-iframe-title') || 'Embedded form');
      slot.appendChild(f);
    });

    // Let a page hook run once on first open (e.g. Ochre init)
    var hook = modal.getAttribute('data-on-first-open');
    if (hook && typeof window[hook] === 'function') {
      modal.removeAttribute('data-on-first-open');
      try { window[hook](modal); } catch (e) { console.error('modal hook failed', e); }
    }
  }

  function open(id) {
    var modal = document.getElementById(id);
    if (!modal || openModal) return;

    lastFocus = document.activeElement;
    hydrate(modal);

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    openModal = modal;

    // Must be the close BUTTON — [data-modal-close] also matches the backdrop
    // div, and .focus() on a non-focusable div silently leaves focus on <body>.
    var close = modal.querySelector('button[data-modal-close]');
    var first = focusables(modal)[0];
    (close || first || modal).focus();
  }

  function close() {
    if (!openModal) return;
    openModal.hidden = true;
    openModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    openModal = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-modal-open]');
    if (trigger) {
      e.preventDefault();
      open(trigger.getAttribute('data-modal-open'));
      return;
    }
    if (e.target.closest('[data-modal-close]')) {
      e.preventDefault();
      close();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (!openModal) return;

    if (e.key === 'Escape') { e.preventDefault(); close(); return; }

    // Keep tabbing inside the dialog
    if (e.key === 'Tab') {
      var items = focusables(openModal);
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // Let pages open/close programmatically if they need to
  window.siteModal = { open: open, close: close };
})();
