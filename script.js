(() => {
  const body = document.body;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reveal on scroll
  const revealEls = [...document.querySelectorAll('.reveal')];
  if ('IntersectionObserver' in window && !reduceMotion) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .14, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(el => revealObserver.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  // Site theme follows the section in view
  const themedSections = [...document.querySelectorAll('[data-theme]')];
  if ('IntersectionObserver' in window) {
    const themeObserver = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) body.dataset.siteTheme = visible.target.dataset.theme;
    }, { threshold: [0.25, 0.45, 0.65] });
    themedSections.forEach(section => themeObserver.observe(section));
  }

  // Event rail navigation + active state
  const railButtons = [...document.querySelectorAll('.rail-item')];
  railButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.event);
      if (target) target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
  });

  const eventSections = [...document.querySelectorAll('[data-event-section]')];
  if ('IntersectionObserver' in window) {
    const eventObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const name = entry.target.dataset.eventSection;
          railButtons.forEach(btn => {
            const active = btn.dataset.event === name;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-selected', String(active));
          });
        }
      });
    }, { threshold: .45 });
    eventSections.forEach(section => eventObserver.observe(section));
  }

  // FINAL strict Sufi-only music controller.
  // Music plays only while Sufi is the active section.
  // As soon as the Haldi section begins to enter the lower part of the screen,
  // the Sufi track fades out, then pauses and resets.
  const sufiSection = document.getElementById('sufi');
  const haldiSection = document.getElementById('haldi');
  const sufiAudio = document.getElementById('sufiAudio');
  let sufiPlaying = false;
  let sufiRaf = 0;
  let sufiFadeRaf = 0;
  let sufiFadingOut = false;

  const centerIsInsideSufi = () => {
    if (!sufiSection) return false;
    const x = Math.max(1, Math.min(window.innerWidth - 1, window.innerWidth / 2));
    const y = Math.max(1, Math.min(window.innerHeight - 1, window.innerHeight / 2));
    const el = document.elementFromPoint(x, y);
    return !!(el && el.closest && el.closest('#sufi') === sufiSection);
  };

  const haldiHasReachedFadePoint = () => {
    if (!haldiSection) return false;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const haldiTop = haldiSection.getBoundingClientRect().top;

    // Fade exactly as the next section starts appearing near the bottom,
    // matching the transition point shown in the mobile screenshot.
    return haldiTop <= vh * 0.88;
  };

  const inSufiPlaybackZone = () => {
    return centerIsInsideSufi() && !haldiHasReachedFadePoint();
  };

  const cancelSufiFade = () => {
    if (sufiFadeRaf) {
      cancelAnimationFrame(sufiFadeRaf);
      sufiFadeRaf = 0;
    }
    sufiFadingOut = false;
  };

  const stopSufiNow = () => {
    if (!sufiAudio) return;
    cancelSufiFade();
    sufiPlaying = false;
    sufiAudio.pause();
    sufiAudio.volume = 1;
    try { sufiAudio.currentTime = 0; } catch (_) {}
  };

  const fadeOutSufi = (duration = 1000) => {
    if (!sufiAudio || sufiAudio.paused) {
      stopSufiNow();
      return;
    }
    if (sufiFadingOut) return;

    cancelSufiFade();
    sufiFadingOut = true;
    const from = Math.max(0, Math.min(1, sufiAudio.volume));
    const started = performance.now();

    const step = (now) => {
      // If the guest scrolls back into Sufi before the fade finishes,
      // cancel the fade and restore normal playback.
      if (!haldiHasReachedFadePoint() && centerIsInsideSufi()) {
        sufiAudio.volume = 1;
        sufiFadingOut = false;
        sufiFadeRaf = 0;
        return;
      }

      const p = Math.min(1, (now - started) / duration);
      const eased = p * p * (3 - 2 * p);
      sufiAudio.volume = Math.max(0, from * (1 - eased));

      if (p < 1) {
        sufiFadeRaf = requestAnimationFrame(step);
      } else {
        sufiFadeRaf = 0;
        sufiFadingOut = false;
        sufiPlaying = false;
        sufiAudio.pause();
        sufiAudio.volume = 1;
        try { sufiAudio.currentTime = 0; } catch (_) {}
      }
    };

    sufiFadeRaf = requestAnimationFrame(step);
  };

  const playSufiIfAllowed = () => {
    if (!sufiAudio) return;

    if (haldiHasReachedFadePoint()) {
      fadeOutSufi();
      return;
    }

    if (!centerIsInsideSufi()) {
      stopSufiNow();
      return;
    }

    cancelSufiFade();

    if (!sufiAudio.paused) {
      sufiAudio.volume = 1;
      sufiPlaying = true;
      return;
    }

    sufiAudio.loop = true;
    sufiAudio.volume = 1;
    try { sufiAudio.currentTime = 0; } catch (_) {}

    const attempt = sufiAudio.play();
    if (attempt && typeof attempt.then === 'function') {
      attempt.then(() => {
        if (inSufiPlaybackZone()) {
          sufiPlaying = true;
          sufiAudio.volume = 1;
        } else if (haldiHasReachedFadePoint()) {
          fadeOutSufi();
        } else {
          stopSufiNow();
        }
      }).catch(() => {
        sufiPlaying = false;
      });
    } else {
      sufiPlaying = true;
    }
  };

  const enforceSufiZone = () => {
    sufiRaf = 0;

    if (haldiHasReachedFadePoint()) {
      fadeOutSufi();
    } else if (centerIsInsideSufi()) {
      playSufiIfAllowed();
    } else {
      stopSufiNow();
    }
  };

  const queueSufiCheck = () => {
    if (sufiRaf) return;
    sufiRaf = requestAnimationFrame(enforceSufiZone);
  };

  window.addEventListener('scroll', queueSufiCheck, { passive: true });
  window.addEventListener('resize', queueSufiCheck, { passive: true });

  // Mobile Safari can use these real gestures to begin audio once Sufi is active.
  // They still cannot start the track outside the strict Sufi playback zone.
  document.addEventListener('touchmove', playSufiIfAllowed, { passive: true });
  document.addEventListener('touchend', playSufiIfAllowed, { passive: true });
  document.addEventListener('pointerup', playSufiIfAllowed, { passive: true });
  document.addEventListener('wheel', playSufiIfAllowed, { passive: true });
  document.addEventListener('click', playSufiIfAllowed, { passive: true });
  document.addEventListener('keydown', playSufiIfAllowed);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopSufiNow();
    else enforceSufiZone();
  });
  window.addEventListener('pagehide', stopSufiNow);

  stopSufiNow();
  enforceSufiZone();

  // Countdown to start of first event in India Standard Time
  const target = new Date('2027-01-04T19:00:00+05:30').getTime();
  const parts = {
    days: document.getElementById('days'),
    hours: document.getElementById('hours'),
    minutes: document.getElementById('minutes'),
    seconds: document.getElementById('seconds')
  };
  const updateCountdown = () => {
    let diff = Math.max(0, target - Date.now());
    const days = Math.floor(diff / 86400000); diff %= 86400000;
    const hours = Math.floor(diff / 3600000); diff %= 3600000;
    const minutes = Math.floor(diff / 60000); diff %= 60000;
    const seconds = Math.floor(diff / 1000);
    parts.days.textContent = String(days).padStart(3,'0');
    parts.hours.textContent = String(hours).padStart(2,'0');
    parts.minutes.textContent = String(minutes).padStart(2,'0');
    parts.seconds.textContent = String(seconds).padStart(2,'0');
  };
  updateCountdown();
  const timer = setInterval(updateCountdown, 1000);
  window.addEventListener('pagehide', () => clearInterval(timer), { once:true });

  // Poster modal
  const modal = document.getElementById('posterModal');
  const modalImage = document.getElementById('posterImage');
  const modalTitle = document.getElementById('posterTitle');
  const modalClose = document.getElementById('posterClose');
  document.querySelectorAll('.poster-open').forEach(btn => {
    btn.addEventListener('click', () => {
      modalImage.src = btn.dataset.poster;
      modalImage.alt = `${btn.dataset.title} invitation artwork`;
      modalTitle.textContent = btn.dataset.title;
      if (typeof modal.showModal === 'function') modal.showModal();
    });
  });
  modalClose.addEventListener('click', () => modal.close());
  modal.addEventListener('click', e => {
    const rect = modal.getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside) modal.close();
  });

  // Mobile menu
  const menuToggle = document.getElementById('menuToggle');
  const siteNav = document.getElementById('siteNav');
  menuToggle.addEventListener('click', () => {
    const open = siteNav.classList.toggle('is-open');
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  siteNav.addEventListener('click', e => {
    if (e.target.closest('a')) {
      siteNav.classList.remove('is-open');
      menuToggle.setAttribute('aria-expanded', 'false');
    }
  });

  // Add full wedding weekend as an ICS file
  const calendarButton = document.getElementById('calendarButton');
  if (calendarButton) calendarButton.addEventListener('click', () => {
    const ics = [
      'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Zaid & Fatima//Wedding Weekend//EN','CALSCALE:GREGORIAN',
      'BEGIN:VEVENT','UID:zf-udaipur-2027@meetthememons','DTSTAMP:20260919T000000Z',
      'DTSTART;VALUE=DATE:20270104','DTEND;VALUE=DATE:20270107',
      'SUMMARY:Zaid & Fatima — Udaipur Wedding Celebrations',
      'LOCATION:Trident, Udaipur, Rajasthan, India',
      'DESCRIPTION:Wedding celebrations for Zaid & Fatima. 04–06 January 2027. #MeetTheMemons',
      'END:VEVENT','END:VCALENDAR'
    ].join('\r\n');
    const blob = new Blob([ics], { type:'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'Zaid-Fatima-Udaipur-2027.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // Copy hashtag with fallback
  const copyTag = document.getElementById('copyTag');
  const copyStatus = document.getElementById('copyStatus');
  copyTag.addEventListener('click', async () => {
    const value = '#MeetTheMemons';
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement('textarea');
        ta.value = value; ta.style.position='fixed'; ta.style.opacity='0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      copyStatus.textContent = 'Hashtag copied.';
    } catch {
      copyStatus.textContent = 'Copy this: #MeetTheMemons';
    }
  });

  // Subtle cursor light on fine pointers only
  const orb = document.querySelector('.cursor-orb');
  if (window.matchMedia('(hover:hover) and (pointer:fine)').matches && !reduceMotion) {
    let raf = null, x = 0, y = 0;
    document.addEventListener('pointermove', e => {
      x = e.clientX; y = e.clientY; orb.style.opacity = '.85';
      if (!raf) raf = requestAnimationFrame(() => {
        orb.style.left = `${x}px`; orb.style.top = `${y}px`; raf = null;
      });
    }, { passive:true });
    document.addEventListener('pointerleave', () => { orb.style.opacity = '0'; });
  }
})();
