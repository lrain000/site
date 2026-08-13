/* Hide the fixed nav while scrolling down (so page text never collides with
   it); reveal it again on scroll-up or near the top. Inert on pages that
   don't scroll. Shared by the scrolling pages (tour, shop, newsletter). */
(function () {
  var nav = document.querySelector('nav');
  if (!nav) return;

  nav.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
  nav.style.willChange = 'transform';

  var lastY = window.scrollY || 0;
  var hidden = false;

  function hide() {
    if (hidden) return;
    hidden = true;
    nav.style.transform = 'translateY(-120%)';
    nav.style.opacity = '0';
    nav.style.pointerEvents = 'none';
  }

  function show() {
    if (!hidden) return;
    hidden = false;
    nav.style.transform = '';
    nav.style.opacity = '';
    nav.style.pointerEvents = '';
  }

  function onScroll() {
    var y = window.scrollY || 0;
    if (y < 90) {                 // near the top: always visible
      show();
    } else if (y > lastY + 6) {   // scrolling down past the hero: hide
      hide();
    } else if (y < lastY - 6) {   // scrolling back up: reveal
      show();
    }
    lastY = y;
  }

  window.addEventListener('scroll', onScroll, { passive: true });
})();
