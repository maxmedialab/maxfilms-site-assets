/* ============================================================
   MAXFILMS · main.js
   Progressive enhancement only: the page is fully readable
   with zero JS. Lenis/GSAP/ScrollTrigger load as SEPARATE
   script tags (GHL Body Tracking Code / page foot); this file
   polls for them, same model as recap main-v2.js, and falls
   back to CSS-only if they never arrive.
   Deploy: GitHub repo → jsDelivr @pinned-hash → GHL Body code.
   ============================================================ */
(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        || /[?&]noanim/.test(window.location.search); // ?noanim = debug/testing: static render

    /* ---------- Splash (capped hard at 2.5s, whatever happens) ---------- */
    function dismissSplash() {
        var s = document.getElementById('mf-splash');
        if (s && !s.classList.contains('hidden')) s.classList.add('hidden');
    }
    if (document.readyState === 'complete') {
        setTimeout(dismissSplash, 400);
    } else {
        window.addEventListener('load', function () { setTimeout(dismissSplash, 400); });
    }
    setTimeout(dismissSplash, 2500); // hard cap: never trap the user behind the splash

    function onReady(fn) {
        if (document.readyState !== 'loading') fn();
        else document.addEventListener('DOMContentLoaded', fn);
    }

    /* ============================================================
       Form bridge (ported from recapmedia-site-v2 main-v2.js)
       Custom HTML form (.quote-form)      = the UI visitors see
       GHL native form (section#form-builder, hidden) = the backend
       On submit: block the native submit, validate, copy the values
       into the hidden GHL form (Vue-safe), click its submit button,
       then show the success panel. If the GHL form or a mapped
       field is missing, show the error panel with the email address
       instead of faking success.
       ============================================================ */
    function initFormBridge() {
        // DEPLOY (lead): set both once the GHL form "MAXFILMS: Shoot inquiry" is built.
        // GHL_FORM_ID: the form id, as in the field wrapper ids "el_<FORM_ID>_...".
        // Empty = accept the page's only #form-builder, and refuse if there are several.
        var GHL_FORM_ID = 'JNhAR4LYQtUUVUGxx14g';
        // Standard contact fields render with these ids; the three custom fields are
        // found through their wrappers "el_<FORM_ID>_<customFieldId>_<n>" (read from the
        // staging render, 6 Nov 2026).
        var FIELD_MAP = [
            { from: 'first_name',   to: '#first_name' },
            { from: 'last_name',    to: '#last_name' },
            { from: 'email',        to: '#email' },
            { from: 'organization', to: '#organization' },
            { from: 'country',      to: '[id^="el_JNhAR4LYQtUUVUGxx14g_HCmUCud3E9k01lrHoZHo_"] input' },
            { from: 'shoot_dates',  to: '[id^="el_JNhAR4LYQtUUVUGxx14g_Szfaqs96xOFnAINdIcg1_"] input' },
            { from: 'about_shoot',  to: '[id^="el_JNhAR4LYQtUUVUGxx14g_Sh5IvnoogKzalnOmsJ9x_"] textarea' }
        ];

        var SUCCESS_HTML =
            '<div class="form-success" role="status" tabindex="-1">' +
                '<h3 class="form-success-heading">Thanks, it\'s on its way to me.</h3>' +
                '<p class="form-success-body">I\'ll reply by email.</p>' +
                '<button type="button" class="btn btn--ghost form-success-close">Done</button>' +
            '</div>';

        var ERROR_HTML =
            '<div class="form-success form-error" role="alert" tabindex="-1">' +
                '<h3 class="form-success-heading">Something went wrong.</h3>' +
                '<p class="form-success-body">Please email <a href="mailto:hello@maxfilms.no">hello@maxfilms.no</a>.</p>' +
                '<button type="button" class="btn btn--ghost form-success-close">Got it</button>' +
            '</div>';

        // ── Which hidden GHL form is ours ─────────────────────────────
        // Every GHL form renders as section#form-builder; the field wrappers carry its id.
        function findGHLForm() {
            var all = document.querySelectorAll('#form-builder');
            if (GHL_FORM_ID) {
                for (var i = 0; i < all.length; i++) {
                    if (all[i].querySelector('[id^="el_' + GHL_FORM_ID + '_"]')) return all[i];
                }
                return null;
            }
            return all.length === 1 ? all[0] : null; // never guess between several forms
        }

        // ── Vue-compatible value setter ──────────────────────────────
        // GHL forms are Vue/Nuxt: setting .value directly won't trigger
        // reactivity. Use the native setter, then fire the events.
        function setGHLValue(el, value) {
            if (!el) return;
            var proto = el.tagName === 'TEXTAREA'
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
            var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            setter.call(el, value);
            el.dispatchEvent(new Event('input',  { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur',   { bubbles: true }));
        }

        // ── Keep the native form out of sight and out of the tab order ─
        // Only the form or its .ghl-form-hidden / .c-form wrapper: never climb
        // to .c-row, which in GHL can wrap a whole global section.
        function hideGHLForm() {
            var ghl = findGHLForm();
            if (!ghl) return;
            var target = ghl.closest('.ghl-form-hidden') || ghl.closest('.c-form') || ghl;
            target.style.cssText = 'position:absolute!important;left:-9999px!important;height:0!important;overflow:hidden!important;pointer-events:none!important;opacity:0!important;';
            target.setAttribute('aria-hidden', 'true');
            // aria-hidden doesn't stop the Tab key: take the hidden form's fields, button and
            // template links out of the tab order (scripted value-setting and click() still work)
            target.querySelectorAll('a[href], input, textarea, select, button, iframe, [tabindex]').forEach(function (el) {
                el.setAttribute('tabindex', '-1');
            });
        }

        // Copies the values and clicks the GHL submit. Returns false (and
        // submits nothing) unless the form, its submit button and the
        // destination of every filled-in field are all there.
        function bridgeToGHL(customForm) {
            var ghl = findGHLForm();
            if (!ghl) return false;
            var ghlBtn = ghl.querySelector('button[type="submit"]');
            if (!ghlBtn) return false;

            var pairs = [];
            for (var i = 0; i < FIELD_MAP.length; i++) {
                var m = FIELD_MAP[i];
                var src = customForm.querySelector('[name="' + m.from + '"]');
                if (!src) continue;
                var val = (src.value || '').trim();
                var dst = null;
                try { dst = ghl.querySelector(m.to); } catch (err) { dst = null; }
                if (!dst) {
                    if (val || m.from === 'email') return false; // a value would be lost
                    continue;
                }
                pairs.push([dst, val]);
            }

            pairs.forEach(function (p) { setGHLValue(p[0], p[1]); });
            setTimeout(function () { ghlBtn.click(); }, 400);
            return true;
        }

        // ── Success / error panel ────────────────────────────────────
        function showConfirmation(form, isError) {
            var container = form.closest('.form-slot') || form.parentNode;
            if (!container) return;
            var old = container.querySelector('.form-success');
            if (old) old.remove();

            var btn = form.querySelector('[type="submit"]');
            form.style.display = 'none';

            var holder = document.createElement('div');
            holder.innerHTML = isError ? ERROR_HTML : SUCCESS_HTML;
            var panel = holder.firstChild;
            container.appendChild(panel);
            try { panel.focus({ preventScroll: true }); } catch (err) { panel.focus(); }

            var closeBtn = panel.querySelector('.form-success-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', function () {
                    panel.remove();
                    form.style.display = '';
                    if (!isError) form.reset(); // keep what they typed after an error
                    if (btn) {
                        btn.disabled = false;
                        if (btn.getAttribute('data-label')) btn.innerHTML = btn.getAttribute('data-label');
                    }
                });
            }
        }

        // ── Anti-spam: rate limit + timing check ─────────────────────
        var lastSubmit = 0;
        var submitCount = 0;
        var pageLoadTime = Date.now();

        // ── Main submit handler (capture phase) ──────────────────────
        document.addEventListener('submit', function (e) {
            var form = e.target;
            if (!form.classList || !form.classList.contains('quote-form')) return;

            // stop the native GET submit (it would put the details in the URL)
            e.preventDefault();
            // stop GHL/VidLead external tracking from catching this submit too
            // and logging a duplicate "External Form" submission
            e.stopPropagation();

            // 1. Honeypot: bots fill the hidden field
            var hp = form.querySelector('input[name="website"]');
            if (hp && hp.value) return;

            // 2. Rate limit: max 2 submissions per 30 seconds
            var now = Date.now();
            if (now - lastSubmit < 30000) {
                submitCount++;
                if (submitCount > 2) return; // silently drop
            } else {
                submitCount = 1;
            }
            lastSubmit = now;

            // 3. Timing: under 3s after load is mostly bots, but autofill can be
            //    that fast too, so show the error panel with the email address.
            if (now - pageLoadTime < 3000) {
                setTimeout(function () { showConfirmation(form, true); }, 400);
                return;
            }

            // ── Validation: required fields + email format ──────────
            var firstError = null;
            var prev = form.querySelectorAll('.has-error');
            for (var j = 0; j < prev.length; j++) prev[j].classList.remove('has-error');
            var invalid = form.querySelectorAll('[aria-invalid="true"]');
            for (var n = 0; n < invalid.length; n++) invalid[n].removeAttribute('aria-invalid');

            var required = form.querySelectorAll('[required]');
            for (var k = 0; k < required.length; k++) {
                var field = required[k];
                var val = (field.value || '').trim();
                var bad = !val;
                if (field.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) bad = true;
                if (bad) {
                    field.setAttribute('aria-invalid', 'true');
                    var group = field.closest('.form-group');
                    if (group) group.classList.add('has-error');
                    if (!firstError) firstError = field;
                }
            }
            if (firstError) {
                var g = firstError.closest('.form-group') || firstError;
                g.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
                setTimeout(function () { firstError.focus({ preventScroll: true }); }, 400);
                return;
            }

            // ── Sending state ────────────────────────────────────────
            var submitBtn = form.querySelector('[type="submit"]');
            if (submitBtn) {
                if (!submitBtn.getAttribute('data-label')) submitBtn.setAttribute('data-label', submitBtn.innerHTML);
                submitBtn.disabled = true;
                submitBtn.textContent = 'Sending…';
            }

            if (!bridgeToGHL(form)) {
                // no GHL form, or a field it can't take: say so, with the email address
                setTimeout(function () { showConfirmation(form, true); }, 500);
                return;
            }

            // give GHL time to post before confirming
            setTimeout(function () { showConfirmation(form, false); }, 2500);
        }, true);

        // ── Clear a field's error as soon as it's edited ─────────────
        function clearError(e) {
            var field = e.target;
            if (!field.closest || !field.closest('.quote-form')) return;
            field.removeAttribute('aria-invalid');
            var group = field.closest('.form-group');
            if (group) group.classList.remove('has-error');
        }
        document.addEventListener('input', clearError, false);
        document.addEventListener('change', clearError, false);

        // GHL renders its form after load, so hide it at each stage
        onReady(hideGHLForm);
        window.addEventListener('load', function () { hideGHLForm(); setTimeout(hideGHLForm, 1500); });
    }

    // The submit handler only needs `document`, so register it right away.
    try { initFormBridge(); } catch (err) {
        if (window.console && console.error) console.error('[MF] initFormBridge error:', err);
    }

    onReady(function () {

        var lenisRef = null; // set below once smooth scroll starts; the work rows use it for instant scroll fixes

        /* ---------- JS-ready gate (reveal styles only apply now) ---------- */
        if (!reduceMotion) document.documentElement.classList.add('js-ready');

        /* ---------- Nav scroll state ---------- */
        var nav = document.getElementById('nav');
        function onScroll() {
            if (!nav) return;
            if (window.scrollY > 24) nav.classList.add('scrolled');
            else nav.classList.remove('scrolled');
        }
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();

        /* ---------- Mobile menu ---------- */
        var burger = document.querySelector('.nav-hamburger');
        var mobileMenu = document.querySelector('.mobile-menu');
        if (burger && mobileMenu) {
            burger.addEventListener('click', function () {
                var open = mobileMenu.classList.toggle('open');
                burger.classList.toggle('open', open);
                mobileMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
                document.body.style.overflow = open ? 'hidden' : '';
            });
            mobileMenu.querySelectorAll('a').forEach(function (a) {
                a.addEventListener('click', function () {
                    mobileMenu.classList.remove('open');
                    burger.classList.remove('open');
                    document.body.style.overflow = '';
                });
            });
        }

        /* ---------- FAQ accordion (single handler: the recap double-handler
           bug is the cautionary tale; GSAP never touches these) ---------- */
        document.querySelectorAll('.faq-item').forEach(function (item) {
            var q = item.querySelector('.faq-q');
            var a = item.querySelector('.faq-a');
            if (!q || !a) return;
            q.addEventListener('click', function () {
                var isOpen = item.classList.contains('open');
                document.querySelectorAll('.faq-item.open').forEach(function (other) {
                    other.classList.remove('open');
                    other.querySelector('.faq-a').style.maxHeight = null;
                    other.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
                });
                if (!isOpen) {
                    item.classList.add('open');
                    a.style.maxHeight = a.scrollHeight + 'px';
                    q.setAttribute('aria-expanded', 'true');
                }
            });
        });

        /* ---------- Previous work: compact rows that open (Max, 7 Nov). One row open at a time.
           Desktop mouse: a row opens once the pointer rests on it for HOVER_MS (hover intent, so sweeping
           down the list does not open every row on the way). A click or tap on a row toggles it. When a row
           above the one opening closes, it closes at once and the page scrolls by the height it lost, so the
           row under the pointer or finger stays where it is. Styles: the .log-list block in css/style.css. ---------- */
        var logList = document.getElementById('log-list');
        if (logList) {
            document.documentElement.classList.add('log-js');
            var HOVER_MS = 180;
            var fineHover = window.matchMedia('(hover: hover) and (pointer: fine)');
            var hoverTimer = null, pendingEntry = null, shutEntry = null, lastX = -1, lastY = -1;

            var setOpen = function (entry, open) {
                entry.classList.toggle('is-open', open);
                var btn = entry.querySelector('.log-toggle');
                if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            };
            var scrollByNow = function (dy) {
                if (!dy) return;
                if (lenisRef) lenisRef.scrollTo(window.scrollY + dy, { immediate: true, force: true });
                else window.scrollBy({ top: dy, behavior: 'instant' });
            };
            var openEntry = function (entry, byHover) {
                var prev = logList.querySelector('.log-entry.is-open');
                if (prev && prev !== entry) {
                    if (prev.compareDocumentPosition(entry) & Node.DOCUMENT_POSITION_FOLLOWING) {
                        var before = entry.getBoundingClientRect().top;
                        prev.classList.add('no-anim');
                        setOpen(prev, false);
                        var dy = entry.getBoundingClientRect().top - before; // forces layout with the row above shut
                        prev.classList.remove('no-anim');
                        scrollByNow(dy);
                    } else {
                        setOpen(prev, false);
                    }
                }
                setOpen(entry, true);
                entry.mfHoverOpenedAt = byHover ? Date.now() : 0;
            };
            var cancelHover = function () { clearTimeout(hoverTimer); hoverTimer = null; pendingEntry = null; };

            logList.addEventListener('pointermove', function (e) {
                if (e.pointerType !== 'mouse' || !fineHover.matches) return;
                if (e.clientX === lastX && e.clientY === lastY) return; // the page scrolled under a still pointer
                lastX = e.clientX; lastY = e.clientY;
                var entry = e.target.closest('.log-entry');
                if (shutEntry && entry !== shutEntry) shutEntry = null;
                if (!entry || entry.classList.contains('is-open') || entry === shutEntry) { cancelHover(); return; }
                if (entry === pendingEntry) return;
                cancelHover();
                pendingEntry = entry;
                hoverTimer = setTimeout(function () { pendingEntry = null; hoverTimer = null; openEntry(entry, true); }, HOVER_MS);
            });
            logList.addEventListener('pointerleave', function () { cancelHover(); shutEntry = null; });
            // A click or tap anywhere on a closed row opens it; on an open row only its header closes it,
            // so links, reading and selecting text in the open part never shut the row.
            logList.addEventListener('click', function (e) {
                var entry = e.target.closest('.log-entry');
                if (!entry || e.target.closest('a')) return;
                if (e.detail && String(window.getSelection ? window.getSelection() : '').length) return; // mouse text selection
                cancelHover();
                if (!entry.classList.contains('is-open')) { openEntry(entry, false); return; }
                if (!e.target.closest('.log-head')) return;
                if (Date.now() - (entry.mfHoverOpenedAt || 0) < 800) return; // a click just after the hover opened it means "open"
                setOpen(entry, false);
                shutEntry = entry; // stays shut until the pointer leaves it
            });
        }

        /* ---------- Hero loop: still poster frame under reduced motion or Save-Data ---------- */
        var heroVideo = document.querySelector('.hero-video');
        var saveData = navigator.connection && navigator.connection.saveData;
        if (heroVideo && (reduceMotion || saveData)) {
            heroVideo.removeAttribute('autoplay');
            heroVideo.pause();
        }

        /* ---------- HUD timecode (decorative) ---------- */
        var tc = document.getElementById('hud-timecode');
        if (tc && !reduceMotion) {
            var frames = 0;
            var t0 = Date.now();
            setInterval(function () {
                var el = Math.floor((Date.now() - t0) / 1000);
                frames = (frames + 1) % 25;
                var h = String(Math.floor(el / 3600)).padStart(2, '0');
                var m = String(Math.floor((el % 3600) / 60)).padStart(2, '0');
                var s = String(el % 60).padStart(2, '0');
                var f = String(frames).padStart(2, '0');
                tc.textContent = h + ':' + m + ':' + s + ':' + f;
            }, 40);
        }

        /* ---------- Reveals: IntersectionObserver + CSS class, ALWAYS.
           Class-based on purpose: a CSS transition settles to its end state
           even in throttled/background tabs, where a JS tween (rAF-driven)
           can freeze mid-animation and leave content invisible. GSAP is
           never in charge of content visibility. ---------- */
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    // hidden tab = transitions are frozen by the browser; apply the
                    // end state instantly so content is never stuck invisible
                    if (document.hidden) e.target.style.transition = 'none';
                    e.target.classList.add('in');
                    io.unobserve(e.target);
                }
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
        document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });

        /* ---------- Lenis + GSAP: smooth scroll + decoration only ---------- */
        var polls = 0;
        (function poll() {
            var ok = window.Lenis && window.gsap && window.ScrollTrigger;
            if (!ok && polls < 40) { polls++; return setTimeout(poll, 100); } // give libs 4s, then skip
            if (!ok || reduceMotion) return;

            try {
                var lenis = new window.Lenis({ duration: 1.05, smoothWheel: true });
                lenisRef = lenis;
                window.gsap.registerPlugin(window.ScrollTrigger);
                lenis.on('scroll', window.ScrollTrigger.update);
                window.gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
                window.gsap.ticker.lagSmoothing(0);

                // anchor links route through lenis
                // "/#work" links (global header/footer, so they also work from /terms) count as in-page on the home page
                var onHome = location.pathname === '/' || /\/index\.html$/.test(location.pathname);
                document.querySelectorAll('a[href^="#"], a[href^="/#"]').forEach(function (a) {
                    a.addEventListener('click', function (ev) {
                        var id = a.getAttribute('href');
                        if (id.charAt(0) === '/') { if (!onHome) return; id = id.slice(1); }
                        if (id.length > 1 && document.querySelector(id)) {
                            ev.preventDefault();
                            lenis.scrollTo(id, { offset: -70 });
                        }
                    });
                });

                // hero viewfinder frame fades out as the hero scrolls away (decorative)
                var frame = document.querySelector('.vf-frame');
                if (frame) {
                    window.gsap.to(frame, {
                        opacity: 0, ease: 'none',
                        scrollTrigger: { trigger: '.hero', start: 'bottom 80%', end: 'bottom 40%', scrub: true }
                    });
                }
            } catch (err) { /* smooth scroll is optional: page works without it */ }
        })();
    });
})();
