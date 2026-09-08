/* ═══════════════════════════════════════════════════════════════════════════
   PatchMap media slots — the swap layer.

   THE WHOLE POINT: real clips land later, on Ryan's timeline, and dropping one
   in must be a config change and nothing else. So every slot renders at its
   final aspect from the first paint, whether or not it has a source. A poster
   arriving, or a video arriving, never moves a pixel of layout — the box was
   always that size.

   ── TWO INDEPENDENT AXES (per the build spec) ─────────────────────────────
   1. SOURCE CONTEXT is fixed by honesty and is a property of the slot, not the
      viewer. `phone-native` was really shot on a phone. `desktop-truth` was
      really shot on a desktop, because building a canvas IS a desktop act and
      faking a phone building one would be a lie about the product.
   2. DELIVERY FRAMING adapts to the viewer. A desktop-truth clip is still
      delivered reframed to portrait for someone holding a phone. That is a
      CROP of honest footage, not a restaging of it — which is why axis 1 can
      stay fixed while this one moves.

      The crop is served by <source media="..."> so the browser picks before it
      fetches. No edge logic, no device sniffing, and one URL for the page —
      deliberately NOT a / and /m split.

   ── WHY <video> AND NOT THE BUNNY IFRAME ──────────────────────────────────
   The existing tutorial modal uses Bunny's iframe embed, which is right for a
   click-to-play lightbox. It is wrong here: an iframe can't take a poster we
   control, can't be lazily deferred per viewport, can't be paused when it
   scrolls away, and can't respect prefers-reduced-motion. Nine of them would
   also mean nine player bundles on a page that has ~2s to look finished on a
   phone. Direct MP4 in a <video> gives all of that back.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* Bunny Stream. `library` matches the tutorial embed already on the live page
     (player.mediadelivery.net/embed/710517/...). `cdnBase` is the pull-zone
     hostname for direct file access — set it once and every slot below can name
     a bare video id instead of a full URL. Until it's set, `null` sources keep
     every slot in placeholder mode, which is a shippable state on purpose. */
  var CDN = {
    library: '710517',
    cdnBase: 'https://vz-582e6ee8-8a2.b-cdn.net',  // library 710517's pull zone
    portraitRendition: 'play_720p.mp4',
    landscapeRendition: 'play_720p.mp4'
  };

  /* A bare video id resolves against the pull zone; anything that already looks
     like a URL is passed through untouched, so a slot can point at an /assets
     file or a third host without special-casing. */
  function resolve(ref, rendition) {
    if (!ref) return null;
    if (/^https?:\/\//.test(ref) || ref.charAt(0) === '/') return ref;
    if (!CDN.cdnBase) return null;
    return CDN.cdnBase.replace(/\/$/, '') + '/' + ref + '/' + rendition;
  }

  /* ── THE SLOTS ───────────────────────────────────────────────────────────
     To go live with a clip: set CDN.cdnBase once, then put the Bunny video id
     in `portrait` and/or `landscape`. Nothing else in this file or either page
     needs to change. `poster` takes an image path the same way.

     `aspect` is [portrait, landscape] as CSS aspect-ratio strings. These are
     DELIVERY aspects — what the box is on each viewport — and they are why the
     page has no layout shift: the box is built from these, not from the file. */
  var SLOTS = {
    /* DRAFT 2 SHOT CHANGE. This was the import mechanic; the hero now shows a
       COMPLETE, live show working on a phone. The hero states the premise of
       the page (the show is scattered across people's heads) and the answer to
       that is the finished document, not the on-ramp that produced it. */
    hero: {
      context: 'phone-native',
      aspect: ['9 / 16', '9 / 16'],
      mode: 'autoplay-loop',
      /* Source is portrait-native (1080x1920) and the delivery aspect is 9/16 on
         both viewports, so ONE file serves both. It sits in `landscape` because
         that entry carries no media attribute and is the fallback everything
         falls through to — including browsers that ignore media on <source>. */
      portrait: null,
      landscape: '235702d9-21bc-4d0f-8bf8-a5bf9d2d4a8d',
      poster: 'https://vz-582e6ee8-8a2.b-cdn.net/235702d9-21bc-4d0f-8bf8-a5bf9d2d4a8d/thumbnail_1.jpg',
      label: 'A complete, live show being worked on a phone — patch, flags, changes landing'
    },

    /* The Foundation pair. These two are shown SIDE BY SIDE in one row, which
       is the only reason they share a delivery aspect: 16/9 next to 9/16 in a
       two-column row is a 300px box beside a 900px one, and the row reads as
       broken rather than as two options. 4/5 is a crop of honest footage on
       both sides — the source context below is still the truth about each. */
    build: {
      context: 'desktop-truth',
      /* WAS 4/5, chosen so this and `import` could share one delivery aspect in
         the .path-pair row. The delivered files broke that premise: this one is
         1080x1080 and import is 1080x1920. Forcing a shared aspect now means
         cropping one of them — 20% off this clip's sides or 30% off import's
         ends — so the pair carries its two native shapes instead. Square desktop
         beside tall phone also happens to say "two paths" better than two
         identical boxes did. Heights differ, so the captions no longer align. */
      aspect: ['1 / 1', '1 / 1'],
      mode: 'autoplay-loop',
      portrait: null,
      landscape: '4f92c4ef-eb3f-4708-9da3-368fc42b5230',
      poster: 'https://vz-582e6ee8-8a2.b-cdn.net/4f92c4ef-eb3f-4708-9da3-368fc42b5230/thumbnail_1.jpg',

      label: 'A show built from scratch on the canvas — nodes self-labelling and auto-patching'
    },
    'import': {
      context: 'phone-native',
      /* WAS 4/5 — see `build` above for why the pair no longer shares one. */
      aspect: ['9 / 16', '9 / 16'],
      mode: 'autoplay-loop',
      portrait: null,
      landscape: 'da5d6c14-7e1d-4f51-aa8d-f604844afae5',
      poster: 'https://vz-582e6ee8-8a2.b-cdn.net/da5d6c14-7e1d-4f51-aa8d-f604844afae5/thumbnail_1.jpg',

      label: 'Smart Import building the channel list from an existing patch sheet'
    },
    liveroom: {
      context: 'phone-native',
      aspect: ['9 / 16', '9 / 16'],
      /* Was scroll-scrub, on the theory that letting the reader drive a
         SEQUENCE — flag raised, routed, resolved — made the routing legible.
         In practice it just meant the clip only moved while you moved, which
         reads as a broken video, not as a control. Plays like the others now.
         (wireScrub below is left intact but is no longer used by any slot.) */
      mode: 'autoplay-loop',
      portrait: null,
      landscape: 'b760754b-e0d2-4aa9-96f0-1483927e235d',
      poster: 'https://vz-582e6ee8-8a2.b-cdn.net/b760754b-e0d2-4aa9-96f0-1483927e235d/thumbnail_1.jpg',
      label: 'A flag firing on a channel and routing across several phones'
    },
    qr: {
      context: 'phone-native',
      /* WAS 4/5. The delivered clip is 1080x1920, and .mslot-video is
         object-fit:cover — a 9/16 source in a 4/5 box loses 30% of its height,
         15% off each end, which is where a QR code and a timestamp live. The
         box matches the footage now. Layout-safe: this sits in .story-grid,
         the same column `liveroom` already fills at 9/16. */
      aspect: ['9 / 16', '9 / 16'],
      mode: 'autoplay-loop',
      portrait: null,
      landscape: '449b6123-b0ef-4b76-9791-6a802ccdfe73',
      poster: 'https://vz-582e6ee8-8a2.b-cdn.net/449b6123-b0ef-4b76-9791-6a802ccdfe73/thumbnail_1.jpg',
      label: 'The viewer QR taped to a rack case, and its live timestamp updating'
    },
    unify: {
      context: 'desktop-truth',
      /* Portrait delivery WAS 4/5, on the assumption a portrait crop of this
         shot would exist. Only the 1920x1080 master does, and object-fit:cover
         would throw away 55% of its WIDTH to fill a 4/5 box — most of a canvas
         is horizontal, so that is the wrong half to lose. Small-but-whole beats
         big-but-cropped here; phones get the same 16/9 frame. */
      aspect: ['16 / 9', '16 / 9'],
      mode: 'autoplay-loop',
      portrait: null,
      landscape: '678d9d8a-0e48-4bba-8102-55a922442a69',
      poster: 'https://vz-582e6ee8-8a2.b-cdn.net/678d9d8a-0e48-4bba-8102-55a922442a69/thumbnail_1.jpg',

      label: 'Patch, wireless and Dante resolving under one document'
    },
    /* `antidata` was removed in draft 2 — the anti–data-entry section merged
       into the Foundation, and its argument is now carried by the `build`
       clip above. A slot with no element to render is dead config, and dead
       config is how a future clip gets produced for a box nobody sees. */
    intelligence: {
      context: 'desktop-truth',
      aspect: ['4 / 5', '16 / 9'],
      mode: 'autoplay-loop',
      portrait: null, landscape: null, poster: null,
      /* HONESTY CONSTRAINT, carried from the copy deck and enforced in markup:
         this slot renders an "Illustrative" badge that is NOT optional. Nobody
         has generated this history yet, so the clip is a demonstration of the
         mechanic on a demo dataset. No invented stats, no implied customers. */
      illustrative: true,
      label: 'Show history resolving into a pattern across twenty shows (demo data)'
    },
    showchain: {
      context: 'desktop-truth',
      /* 16/9 master only — same reasoning as `unify`. */
      aspect: ['16 / 9', '16 / 9'],
      mode: 'autoplay-loop',
      portrait: null,
      landscape: '53fb6dc3-e0fc-4e05-bd98-1aa1eee5a42f',
      poster: 'https://vz-582e6ee8-8a2.b-cdn.net/53fb6dc3-e0fc-4e05-bd98-1aa1eee5a42f/thumbnail_1.jpg',

      label: 'Instance Forward carrying a show to the next date'
    },
    warm: {
      context: 'phone-native',
      aspect: ['9 / 16', '9 / 16'],
      mode: 'autoplay-loop',
      /* Same file as `hero` on purpose — the warm page is the hero's promise
         repeated to someone who already clicked, so a second clip would be a
         second thing to keep in sync for no gain. */
      portrait: null,
      landscape: '235702d9-21bc-4d0f-8bf8-a5bf9d2d4a8d',
      poster: 'https://vz-582e6ee8-8a2.b-cdn.net/235702d9-21bc-4d0f-8bf8-a5bf9d2d4a8d/thumbnail_1.jpg',
      label: 'Reuses the hero clip — a complete, live show on a phone'
    }
  };

  var REDUCED = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PHONE_Q = '(max-width: 820px)';

  /* Concurrency cap. A mid-range Android in the Instagram in-app browser will
     drop frames long before it runs out of bandwidth, and nine simultaneous
     decodes is the way to get there. Two is enough that a slot is never blank
     when it reaches the middle of the screen. */
  var MAX_PLAYING = 2;
  var playing = [];

  function requestPlay(v) {
    if (playing.indexOf(v) !== -1) return;
    while (playing.length >= MAX_PLAYING) {
      var evicted = playing.shift();
      try { evicted.pause(); } catch (e) {}
    }
    playing.push(v);
    var p = v.play();
    /* Autoplay can still be refused (low-power mode is the common one). The
       poster is already painted underneath, so a rejection is a no-op, not a
       hole in the page — swallow it rather than logging noise on every phone. */
    if (p && p['catch']) p['catch'](function () {});
  }

  function releasePlay(v) {
    var i = playing.indexOf(v);
    if (i !== -1) playing.splice(i, 1);
    try { v.pause(); } catch (e) {}
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function build(el, slot) {
    el.className += ' mslot';
    el.setAttribute('data-context', slot.context);
    el.style.setProperty('--aspect-p', slot.aspect[0]);
    el.style.setProperty('--aspect-l', slot.aspect[1]);

    var pSrc = resolve(slot.portrait, CDN.portraitRendition);
    var lSrc = resolve(slot.landscape, CDN.landscapeRendition);
    var poster = slot.poster || null;

    var badges = '';
    if (slot.illustrative) {
      badges += '<span class="mslot-badge mslot-badge--warn">Illustrative — demo data</span>';
    }
    badges += '<span class="mslot-badge">' +
      (slot.context === 'phone-native' ? 'Shot on a phone' : 'Shot on desktop') +
      '</span>';

    /* No source yet → the placeholder IS the finished state for now. It carries
       the slot's own description so the page reads as deliberate rather than
       broken, and so Ryan can see at a glance which clip each box is waiting
       for while he's producing them. */
    if (!pSrc && !lSrc) {
      el.innerHTML =
        '<div class="mslot-frame mslot-frame--empty">' +
          '<div class="mslot-empty">' +
            '<span class="mslot-empty-mark" aria-hidden="true">&#9654;</span>' +
            '<span class="mslot-empty-label">' + esc(slot.label) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="mslot-badges">' + badges + '</div>';
      return;
    }

    var sources = '';
    /* Portrait source is declared FIRST and constrained by media query, because
       <source> resolution is first-match-wins. The landscape entry carries no
       media attribute so it is the fallback for everything else, including
       browsers that ignore the attribute entirely. */
    if (pSrc) sources += '<source src="' + esc(pSrc) + '" media="' + PHONE_Q + '" type="video/mp4">';
    if (lSrc) sources += '<source src="' + esc(lSrc) + '" type="video/mp4">';
    else if (pSrc) sources += '<source src="' + esc(pSrc) + '" type="video/mp4">';

    el.innerHTML =
      '<div class="mslot-frame">' +
        '<video class="mslot-video" muted playsinline loop preload="none" ' +
               'aria-label="' + esc(slot.label) + '"' +
               (poster ? ' poster="' + esc(poster) + '"' : '') + '>' +
          sources +
        '</video>' +
      '</div>' +
      '<div class="mslot-badges">' + badges + '</div>';

    var video = el.querySelector('video');
    if (!video) return;

    if (REDUCED) {
      /* Poster only. preload stays 'none' so a reduced-motion reader never pays
         for a clip they were never going to be shown. */
      video.removeAttribute('loop');
      return;
    }

    if (slot.mode === 'scroll-scrub') wireScrub(el, video);
    else wireLoop(el, video);
  }

  /* Lazy in two stages, and the stages matter. `rootMargin` on the loader is
     generous so metadata is in flight before the box is on screen; the player
     observer is tight so nothing decodes until it's actually being looked at. */
  function wireLoop(el, video) {
    var loaded = false;
    var loader = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting || loaded) return;
        loaded = true;
        video.preload = 'auto';
        video.load();
        loader.disconnect();
      });
    }, { rootMargin: '400px 0px' });
    loader.observe(el);

    var player = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && e.intersectionRatio > 0.35) requestPlay(video);
        else releasePlay(video);
      });
    }, { threshold: [0, 0.35, 0.6] });
    player.observe(el);
  }

  /* Scroll-scrub. The section's travel through the viewport maps onto the
     clip's duration, so the reader drives the sequence at their own pace.

     Seeks are coalesced into rAF: a scroll can fire far more often than the
     decoder can serve a frame, and issuing a seek per scroll event is how this
     technique turns into a stutter on exactly the mid-range phone we're trying
     to stay smooth on. */
  function wireScrub(el, video) {
    var duration = 0, target = 0, queued = false, ready = false, bound = false;

    video.removeAttribute('loop');
    video.preload = 'auto';

    video.addEventListener('loadedmetadata', function () {
      duration = video.duration || 0;
      ready = duration > 0 && isFinite(duration);
      onScroll();
    });

    function apply() {
      queued = false;
      if (!ready) return;
      try { video.currentTime = target; } catch (e) {}
    }

    function onScroll() {
      if (!ready) return;
      var r = el.getBoundingClientRect();
      var vh = global.innerHeight || document.documentElement.clientHeight;
      /* 0 when the box's top reaches the bottom of the viewport, 1 when its
         bottom reaches the top — i.e. the whole time any part of it is visible. */
      var span = r.height + vh;
      var progress = span > 0 ? (vh - r.top) / span : 0;
      progress = Math.max(0, Math.min(1, progress));
      target = progress * duration;
      if (!queued) { queued = true; global.requestAnimationFrame(apply); }
    }

    var loader = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          if (!bound) { video.load(); bound = true; }
          global.addEventListener('scroll', onScroll, { passive: true });
          onScroll();
        } else {
          global.removeEventListener('scroll', onScroll);
        }
      });
    }, { rootMargin: '300px 0px' });
    loader.observe(el);
  }

  function init() {
    var nodes = document.querySelectorAll('[data-slot]');
    Array.prototype.forEach.call(nodes, function (el) {
      var slot = SLOTS[el.getAttribute('data-slot')];
      if (slot) build(el, slot);
    });
  }

  global.PatchMapMedia = { CDN: CDN, SLOTS: SLOTS, init: init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
