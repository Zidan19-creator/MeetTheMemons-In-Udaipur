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

  // Wedding section music controller: Sufi -> Haldi.
  // The crossfade point is anchored to the Haldi date line so it matches
  // the visual transition shown on mobile instead of fading too early.
  const sufiSection = document.getElementById('sufi');
  const haldiSection = document.getElementById('haldi');
  const bollywoodSection = document.getElementById('bollywood');
  const sufiAudio = document.getElementById('sufiAudio');
  const haldiAudio = document.getElementById('haldiAudio');
  const haldiStartMarker = haldiSection?.querySelector('.event-number') || haldiSection;
  const bollywoodStartMarker = bollywoodSection?.querySelector('.event-number') || bollywoodSection;

  let musicRaf = 0;
  let sufiFadeRaf = 0;
  let haldiFadeRaf = 0;
  let activeMusic = 'none';

  const viewportHeight = () =>
    window.visualViewport?.height ||
    window.innerHeight ||
    document.documentElement.clientHeight;

  const markerReached = (marker, ratio = .64) => {
    if (!marker) return false;
    return marker.getBoundingClientRect().top <= viewportHeight() * ratio;
  };

  const sufiHasBegun = () => {
    if (!sufiSection) return false;
    return sufiSection.getBoundingClientRect().top <= viewportHeight() * .5;
  };

  const haldiTransitionReached = () => markerReached(haldiStartMarker, .64);
  const bollywoodTransitionReached = () => markerReached(bollywoodStartMarker, .64);

  const cancelFade = (which) => {
    if (which === 'sufi' && sufiFadeRaf) {
      cancelAnimationFrame(sufiFadeRaf);
      sufiFadeRaf = 0;
    }
    if (which === 'haldi' && haldiFadeRaf) {
      cancelAnimationFrame(haldiFadeRaf);
      haldiFadeRaf = 0;
    }
  };

  const stopAndReset = (audio, which) => {
    if (!audio) return;
    cancelFade(which);
    audio.pause();
    audio.volume = 1;
    try { audio.currentTime = 0; } catch (_) {}
  };

  const fadeTo = (audio, which, target, duration, onDone) => {
    if (!audio) return;
    cancelFade(which);

    const from = Math.max(0, Math.min(1, audio.volume));
    const started = performance.now();

    const step = (now) => {
      const p = Math.min(1, (now - started) / duration);
      const eased = p * p * (3 - 2 * p);
      audio.volume = Math.max(0, Math.min(1, from + (target - from) * eased));

      if (p < 1) {
        const id = requestAnimationFrame(step);
        if (which === 'sufi') sufiFadeRaf = id;
        else haldiFadeRaf = id;
      } else {
        if (which === 'sufi') sufiFadeRaf = 0;
        else haldiFadeRaf = 0;
        if (onDone) onDone();
      }
    };

    const id = requestAnimationFrame(step);
    if (which === 'sufi') sufiFadeRaf = id;
    else haldiFadeRaf = id;
  };

  const ensurePlaying = (audio, startVolume = 0) => {
    if (!audio) return Promise.resolve(false);
    if (!audio.paused) return Promise.resolve(true);

    audio.volume = startVolume;
    try { audio.currentTime = 0; } catch (_) {}

    const attempt = audio.play();
    if (attempt && typeof attempt.then === 'function') {
      return attempt.then(() => true).catch(() => false);
    }
    return Promise.resolve(true);
  };

  const enterSufi = async () => {
    if (!sufiAudio) return;

    activeMusic = 'sufi';
    stopAndReset(haldiAudio, 'haldi');

    const started = await ensurePlaying(sufiAudio, 1);
    if (!started || activeMusic !== 'sufi') return;

    sufiAudio.loop = true;
    sufiAudio.volume = 1;
  };

  const crossfadeToHaldi = async () => {
    activeMusic = 'haldi';

    if (sufiAudio && !sufiAudio.paused) {
      fadeTo(sufiAudio, 'sufi', 0, 1200, () => stopAndReset(sufiAudio, 'sufi'));
    }

    if (!haldiAudio) return;
    if (!haldiAudio.paused && haldiAudio.volume > 0) return;

    const started = await ensurePlaying(haldiAudio, 0);
    if (!started || activeMusic !== 'haldi') return;

    haldiAudio.loop = false;
    fadeTo(haldiAudio, 'haldi', .78, 1200);
  };

  const leaveHaldi = () => {
    if (activeMusic !== 'haldi') return;
    activeMusic = 'none';

    if (haldiAudio && !haldiAudio.paused) {
      fadeTo(haldiAudio, 'haldi', 0, 1000, () => stopAndReset(haldiAudio, 'haldi'));
    } else {
      stopAndReset(haldiAudio, 'haldi');
    }
  };

  const enforceMusicZone = () => {
    musicRaf = 0;

    if (haldiTransitionReached() && !bollywoodTransitionReached()) {
      if (activeMusic !== 'haldi' || haldiAudio?.paused) crossfadeToHaldi();
      return;
    }

    if (sufiHasBegun() && !haldiTransitionReached()) {
      if (activeMusic !== 'sufi' || sufiAudio?.paused) enterSufi();
      return;
    }

    if (bollywoodTransitionReached()) {
      leaveHaldi();
      stopAndReset(sufiAudio, 'sufi');
      return;
    }

    activeMusic = 'none';
    stopAndReset(sufiAudio, 'sufi');
    stopAndReset(haldiAudio, 'haldi');
  };

  const queueMusicCheck = () => {
    if (musicRaf) return;
    musicRaf = requestAnimationFrame(enforceMusicZone);
  };

  window.addEventListener('scroll', queueMusicCheck, { passive: true });
  window.addEventListener('resize', queueMusicCheck, { passive: true });

  const gestureMusicCheck = () => enforceMusicZone();
  document.addEventListener('touchmove', gestureMusicCheck, { passive: true });
  document.addEventListener('touchend', gestureMusicCheck, { passive: true });
  document.addEventListener('pointerup', gestureMusicCheck, { passive: true });
  document.addEventListener('wheel', gestureMusicCheck, { passive: true });
  document.addEventListener('click', gestureMusicCheck, { passive: true });
  document.addEventListener('keydown', gestureMusicCheck);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      activeMusic = 'none';
      stopAndReset(sufiAudio, 'sufi');
      stopAndReset(haldiAudio, 'haldi');
    } else {
      enforceMusicZone();
    }
  });

  window.addEventListener('pagehide', () => {
    stopAndReset(sufiAudio, 'sufi');
    stopAndReset(haldiAudio, 'haldi');
  });

  enforceMusicZone();

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
