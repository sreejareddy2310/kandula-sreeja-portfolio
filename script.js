
/* ========================================================
   Optimized & Readable script.js
   - Preserves original visuals & timings
   - Smooth hero-arrow scroll to #workRoadmap
   - Performance improvements (throttling, RAF, observers)
   - Accessibility touches (aria-live, keyboard focus)
   - Concise single-line comments & section headers
   ======================================================== */
;(function () {
  'use strict';

  // === UTILITIES & GLOBAL CONFIG ===
  const raf = window.requestAnimationFrame.bind(window);
  const cancelRaf = window.cancelAnimationFrame.bind(window);
  const now = () => performance.now();

  // query helpers
  const $ = (s, ctx = document) => ctx.querySelector(s);
  const $$ = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));

  // user motion preference
  const reduceMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // low-performance heuristic
  const hwConcurrency = navigator.hardwareConcurrency || 4;
  const lowPerf = hwConcurrency <= 2;

  // debounce helper
  function debounce(fn, wait = 100) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // throttle helper
  function throttle(fn, limit = 16) {
    let last = 0;
    return function (...args) {
      const t = now();
      if (t - last >= limit) {
        last = t;
        fn.apply(this, args);
      }
    };
  }

  // RAF tracking to cancel on pagehide
  const _rafIds = [];
  function pushRaf(id) {
    if (id) _rafIds.push(id);
  }
  function stopRafs() {
    while (_rafIds.length) cancelRaf(_rafIds.pop());
  }

  // === BOOTSTRAP ===
  document.addEventListener('DOMContentLoaded', () => {
    initHeroModule();
    initRoadmapModule();
    initSkillsModule();
    initUpArrows(); // create up arrows + integrate down-arrow handling
    initParticlesModule();
    initProjectSliders();
    initProjectsLayer();

    // free CPU when page hidden/unloaded
    window.addEventListener('pagehide', stopRafs, { passive: true });
    window.addEventListener('beforeunload', stopRafs, { passive: true });
  });

  // === HERO MODULE ===
  // handles hero video text timing and down-arrow scroll
  function initHeroModule() {
    const video = $('#heroVideo');
    const gotStuckEl = $('#gotStuckText');
    const fixItEl = $('#fixItText');
    const heroArrow = $('.hero-arrow') || $('.hero .hero-arrow');

    if (!video || !gotStuckEl || !fixItEl) return;

    const settings = {
      gotStuck: { fadeIn: 0.5, visible: 1, fadeOut: 0.5 },
      fixIt: { fadeIn: 0.5, visible: 1, fadeOut: 0.5 },
    };

    const CAR_ARRIVAL = 2;
    const CAR_LEAVE = 6;
    let playing = false;

    // reset both floating texts
    function resetTexts() {
      gotStuckEl.style.opacity = '0';
      fixItEl.style.opacity = '0';
      gotStuckEl.style.animation = 'none';
      fixItEl.style.animation = 'none';
    }

    // animate a single text with timing config
    function animateText(el, cfg, delay = 0, customFade = null) {
      const { fadeIn, visible, fadeOut } = cfg;
      setTimeout(() => {
        el.style.animation = `fadeInText ${fadeIn}s forwards`;
      }, delay * 1000);

      setTimeout(() => {
        const fadeName = customFade || 'fadeOutText';
        el.style.animation = `${fadeName} ${fadeOut}s forwards`;
      }, (delay + fadeIn + visible) * 1000);

      return fadeIn + visible + fadeOut;
    }

    // play the two-text sequence
    function playSequence() {
      resetTexts();
      const gotStuckTime = animateText(gotStuckEl, settings.gotStuck, 0);
      animateText(fixItEl, settings.fixIt, gotStuckTime, 'fadeOutRight');
    }

    // throttle timeupdate work
    let lastTimeChecked = -1;
    const onTimeUpdate = throttle(() => {
      if (!video || isNaN(video.currentTime)) return;
      const current = video.currentTime;
      if (Math.abs(current - lastTimeChecked) < 0.1) return;
      lastTimeChecked = current;

      if (current >= CAR_ARRIVAL && current < CAR_LEAVE && !playing) {
        playing = true;
        playSequence();
      } else if (current >= CAR_LEAVE || current < CAR_ARRIVAL) {
        playing = false;
        resetTexts();
      }
    }, 100);

    // respect reduced motion preference
    if (!reduceMotion) {
      video.addEventListener('timeupdate', onTimeUpdate, { passive: true });
    } else {
      // static fallback for reduced-motion users
      gotStuckEl.style.opacity = '1';
      fixItEl.style.opacity = '1';
    }

    // hero arrow scroll handler to roadmap
    if (heroArrow) {
      heroArrow.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          // temporarily clear overflow if CSS blocked scrolling
          const html = document.documentElement;
          const body = document.body;
          const prevHtmlOverflow = html.style.overflow;
          const prevBodyOverflow = body.style.overflow;
          html.style.overflow = '';
          body.style.overflow = '';

          const roadmap = document.getElementById('workRoadmap');
          if (roadmap) {
            roadmap.scrollIntoView({ behavior: 'smooth' });
          } else {
            const nextSection = document.querySelector('.hero + section, section');
            if (nextSection) nextSection.scrollIntoView({ behavior: 'smooth' });
            else window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
          }

          // restore overflow after short delay
          setTimeout(() => {
            html.style.overflow = prevHtmlOverflow;
            body.style.overflow = prevBodyOverflow;
          }, 800);
        },
        { passive: true }
      );
    }
  }

  // === ROADMAP MODULE ===
  // handles car movement, pin typing descriptions, and keyboard nav
  function initRoadmapModule() {
    const roadEl = $('#road');
    const carEl = $('#roadCar');
    const pinEls = $$('.work-roadmap .pin');
    const descWrapperEl = $('#descriptionBox');
    const descTextEl = $('#descText');

    if (!roadEl || !carEl || !pinEls.length || !descWrapperEl || !descTextEl) return;

    // announce changes to screen readers
    descTextEl.setAttribute('aria-live', 'polite');

    let activePin = pinEls[0];
    let isMoving = false;
    let typingInterval = null;

    // descriptions for each pin (matched by lowercased label)
    const DESCRIPTIONS = {
      about: {
        text:
          'As a Frontend Developer and Web Designer, I love turning ideas into interactive, visually engaging websites. I craft experiences that connect creativity with technology.',
        link: { text: 'Read more →', url: 'about' },
      },
      skills: {
        text: 'Explore the core web technologies and frameworks I work with.',
        link: { text: 'Explore skills →', url: 'skills' },
      },
      projects: {
        text: 'Discover some of my featured web projects and creative work.',
        link: { text: 'See projects →', url: 'projects' },
      },
      tools: {
        text: 'Take a look at the tools that power my design and development workflow.',
        link: { text: 'View tools →', url: 'tools' },
      },
      contact: {
        text: 'Let’s connect and collaborate on something amazing together.',
        link: { text: 'Contact me →', url: 'contact' },
      },
    };

    // center of pin relative to road element
    function centerOfPin(pin) {
      const pinRect = pin.getBoundingClientRect();
      const roadRect = roadEl.getBoundingClientRect();
      return pinRect.left - roadRect.left + pinRect.width / 2;
    }

    // move car with clamped target and transition guard
    function moveCarTo(pin) {
      if (!pin || isMoving) return;
      isMoving = true;

      const carWidth = carEl.getBoundingClientRect().width;
      const maxX = Math.max(0, roadEl.clientWidth - carWidth);
      const target = Math.max(0, Math.min(centerOfPin(pin) - carWidth / 2, maxX));

      carEl.style.transition = 'transform 1s cubic-bezier(.22,.8,.33,1)';
      carEl.style.transform = `translateX(${Math.round(target)}px)`;

      const onEnd = () => {
        isMoving = false;
        carEl.removeEventListener('transitionend', onEnd);
      };
      carEl.addEventListener('transitionend', onEnd, { once: true });
    }

    // clear existing typing interval
    function clearTyping() {
      if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
      }
    }

    // show description with left-to-right typing and link
    function showDescriptionForPin(pin) {
      const labelText = (pin.querySelector('.label')?.textContent || '').trim().toLowerCase();
      const data = DESCRIPTIONS[labelText];
      if (!data) return;

      clearTyping();
      descTextEl.textContent = '';
      descWrapperEl.classList.remove('show');

      // ensure LTR layout for typing
      descTextEl.style.direction = 'ltr';
      descTextEl.style.textAlign = 'left';
      descTextEl.style.unicodeBidi = 'plaintext';

      // small delay for CSS transition
      setTimeout(() => descWrapperEl.classList.add('show'), 10);

      const full = data.text;
      let i = 0;
      const speed = 30; // preserved typing speed
      typingInterval = setInterval(() => {
        descTextEl.textContent = full.substring(0, i + 1);
        i++;
        if (i >= full.length) {
          clearTyping();
          // append link and wire smooth scroll
          const a = document.createElement('a');
          a.href = `#${data.link.url}`;
          a.textContent = ' ' + data.link.text;
          a.style.color = '#22e3ff';
          a.style.marginLeft = '8px';
          a.style.textDecoration = 'underline';
          a.addEventListener('click', (ev) => {
            ev.preventDefault();
            const target = document.querySelector(a.getAttribute('href'));
            if (target) target.scrollIntoView({ behavior: 'smooth' });
          });
          descTextEl.appendChild(a);
        }
      }, speed);
    }

    // wire pins with click and keyboard support
    pinEls.forEach((pin) => {
      pin.setAttribute('tabindex', '0');
      pin.setAttribute('role', 'button');

      pin.addEventListener('click', () => {
        if (activePin !== pin) {
          activePin.classList.remove('active');
          pin.classList.add('active');
          activePin = pin;
          moveCarTo(pin);
          showDescriptionForPin(pin);
        }
      });

      pin.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pin.click();
        }
      });
    });

    // place car initially centered on active pin without transition
    function initCarPosition() {
      const carWidth = carEl.getBoundingClientRect().width;
      carEl.style.transition = 'none';
      carEl.style.transform = `translateX(${Math.round(centerOfPin(activePin) - carWidth / 2)}px)`;
      requestAnimationFrame(() => {
        carEl.style.transition = 'transform 1s cubic-bezier(.22,.8,.33,1)';
      });
    }

    initCarPosition();
    showDescriptionForPin(activePin);

    // recenter on resize (debounced)
    window.addEventListener('resize', debounce(initCarPosition, 120), { passive: true });

    // cleanup typing interval on pagehide
    window.addEventListener('pagehide', () => clearTyping());
  }

  // === SKILLS MODULE ===
  // handles sparkle canvas, reveal animations, and skill typing
  function initSkillsModule() {
    const skillsSection = $('#skills');
    if (!skillsSection) return;

    const skillItems = $$('.skill', skillsSection);
    const skillDescBox = $('#skillDescription');
    const leftBracket = $('.bracket.left', skillsSection) || $('.bracket.left');
    const rightBracket = $('.bracket.right', skillsSection) || $('.bracket.right');
    const canvas = $('#sparkleCanvas');

    // if no canvas support, at least wire keyboard on skills
    if (!canvas || !canvas.getContext) {
      skillItems.forEach((skill) => skill.setAttribute('tabindex', '0'));
      return;
    }

    const ctx = canvas.getContext('2d');

    // size canvas to element, prefer ResizeObserver
    function resizeCanvas() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(debounce(resizeCanvas, 80));
      ro.observe(canvas);
    } else {
      window.addEventListener('resize', debounce(resizeCanvas, 120), { passive: true });
    }
    resizeCanvas();

    // sparkles count scaled by device perf
    const sparkleCount = lowPerf ? 40 : 120;
    const sparkles = Array.from({ length: sparkleCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 2 + 0.5,
      d: Math.random() * 1 + 0.3,
    }));

    let sparkleActive = false;
    let sparkleRafId = null;

    // draw loop for sparkles
    function drawSparkles() {
      if (!sparkleActive || reduceMotion) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        sparkleRafId = null;
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
      ctx.shadowColor = '#0ff';
      ctx.shadowBlur = 12;
      for (let i = 0; i < sparkles.length; i++) {
        const s = sparkles[i];
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        s.y += s.d;
        if (s.y > canvas.height) {
          s.y = 0;
          s.x = Math.random() * canvas.width;
        }
      }
      ctx.restore();
      sparkleRafId = raf(drawSparkles);
      pushRaf(sparkleRafId);
    }

    // toggle sparkles based on intersection
    const so = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          sparkleActive = entry.isIntersecting;
          if (sparkleActive && !reduceMotion && !sparkleRafId) drawSparkles();
          if (!sparkleActive && sparkleRafId) {
            cancelRaf(sparkleRafId);
            sparkleRafId = null;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
        });
      },
      { threshold: 0.3 }
    );
    so.observe(skillsSection);

    // reveal skill items with timings
    function animateSkills() {
      skillItems.forEach((skill) => skill.classList.remove('show', 'center', 'fade'));
      if (skillDescBox) skillDescBox.textContent = '';
      leftBracket && leftBracket.classList.remove('open');
      rightBracket && rightBracket.classList.remove('open');

      setTimeout(() => leftBracket && leftBracket.classList.add('open'), 100);
      setTimeout(() => rightBracket && rightBracket.classList.add('open'), 400);

      setTimeout(() => {
        skillItems.forEach((skill, i) => {
          setTimeout(() => skill.classList.add('show'), i * 200);
        });
      }, 1000);
    }

    // observer to trigger reveal when section visible
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (!reduceMotion) animateSkills();
            else {
              // reduced motion: show without animation
              skillItems.forEach((s) => s.classList.add('show'));
              leftBracket && leftBracket.classList.add('open');
              rightBracket && rightBracket.classList.add('open');
            }
          }
        });
      },
      { threshold: 0.4 }
    );
    revealObserver.observe(skillsSection);

    // typing behavior when clicking a skill (keyboard accessible)
    let typingTimeout = null;
    const typeSpeed = 40;
    skillItems.forEach((skill) => {
      skill.setAttribute('tabindex', '0');

      skill.addEventListener('click', () => {
        const isActive = skill.classList.contains('center');
        skillItems.forEach((s) => s.classList.remove('center', 'fade'));
        clearTimeout(typingTimeout);
        if (skillDescBox) skillDescBox.textContent = '';

        if (!isActive) {
          skill.classList.add('center');
          skillItems.forEach((s) => {
            if (s !== skill) s.classList.add('fade');
          });

          const desc = skill.dataset.desc || '';
          let i = 0;
          function typeChar() {
            if (i < desc.length) {
              skillDescBox.textContent += desc.charAt(i++);
              typingTimeout = setTimeout(typeChar, typeSpeed);
            }
          }
          typeChar();
        }
      });

      skill.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          skill.click();
        }
      });
    });

    // cleanup on pagehide
    window.addEventListener('pagehide', () => {
      clearTimeout(typingTimeout);
    });
  }

  // === UP ARROWS (NAVIGATION) ===
  // injects up-arrow in top-right of each section (keyboard accessible)
  function initUpArrows() {
    const sections = Array.from(document.querySelectorAll('section'));
    const hero = document.querySelector('.hero');
    const roadmap = document.querySelector('.work-roadmap');

    if (!sections.length || !hero || !roadmap) return;

    sections.forEach((section) => {
      // skip if arrow already present
      if (section.querySelector('.goto-arrow')) return;

      const arrow = document.createElement('div');
      arrow.className = 'goto-arrow top-right';
      arrow.setAttribute('role', 'button');
      arrow.setAttribute('tabindex', '0');
      arrow.setAttribute('aria-label', 'Navigate to roadmap or hero');
      arrow.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="30" height="30" fill="#00f0ff">
          <path d="M12 4l-8 8h5v8h6v-8h5z"/>
        </svg>
      `;

      // inline fallback style (primary styling in CSS)
      Object.assign(arrow.style, {
        position: 'absolute',
        top: '20px',
        right: '20px',
        cursor: 'pointer',
        zIndex: '20',
        opacity: '0.85',
        transition: 'transform 0.18s ease, opacity 0.18s ease',
      });

      section.style.position = section.style.position || 'relative';
      section.appendChild(arrow);

      arrow.addEventListener('mouseenter', () => (arrow.style.transform = 'scale(1.12)'));
      arrow.addEventListener('mouseleave', () => (arrow.style.transform = 'scale(1)'));

      arrow.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          if (section.classList.contains('work-roadmap')) {
            hero.scrollIntoView({ behavior: 'smooth' });
          } else {
            roadmap.scrollIntoView({ behavior: 'smooth' });
          }
        },
        { passive: true }
      );

      arrow.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          arrow.click();
        }
      });

      // mobile position tweak
      if (window.innerWidth < 600) {
        arrow.style.top = '10px';
        arrow.style.right = '10px';
      }
    });
  }

  // === CONTACT PARTICLES ===
  // canvas dust + car emojis, visibility-driven and perf-aware
  function initParticlesModule() {
    const canvas = $('#particlesCanvas');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');

    // size canvas to container or window
    function setSize() {
      canvas.width = canvas.offsetWidth || window.innerWidth;
      canvas.height = canvas.offsetHeight || window.innerHeight;
    }
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(debounce(setSize, 80));
      ro.observe(canvas);
    } else {
      window.addEventListener('resize', debounce(setSize, 120), { passive: true });
    }
    setSize();

    // particle counts scale down on weaker devices
    const numDust = lowPerf ? 30 : 60;
    const numCars = lowPerf ? 2 : 5;

    const dust = [];
    const cars = [];

    // dust particle
    class Dust {
      constructor() {
        this.reset();
      }
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 1;
        this.speedY = Math.random() * 0.5 + 0.15;
      }
      update() {
        this.y -= this.speedY;
        if (this.y < -10) this.reset();
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffffaa';
        ctx.fill();
      }
    }

    // car emoji particle
    class CarParticle {
      constructor() {
        this.reset();
      }
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = 18 + Math.random() * 8;
        this.speedY = Math.random() * 0.35 + 0.12;
        this.floatX = Math.random() * 50;
        this.floatSpeed = Math.random() * 0.02 + 0.01;
        this.icon = '🚗';
      }
      update() {
        this.y -= this.speedY;
        this.x += Math.sin(this.floatX) * 0.3;
        this.floatX += this.floatSpeed;
        if (this.y < -60) this.reset();
      }
      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.font = `${this.size}px sans-serif`;
        ctx.globalAlpha = 0.88;
        ctx.fillText(this.icon, 0, 0);
        ctx.restore();
      }
    }

    // initialize particles
    function init() {
      dust.length = 0;
      cars.length = 0;
      for (let i = 0; i < numDust; i++) dust.push(new Dust());
      for (let i = 0; i < numCars; i++) cars.push(new CarParticle());
    }

    let running = true;
    let rafId = null;
    function loop() {
      if (!running || reduceMotion) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < dust.length; i++) {
        dust[i].update();
        dust[i].draw();
      }
      for (let i = 0; i < cars.length; i++) {
        cars[i].update();
        cars[i].draw();
      }
      rafId = raf(loop);
      pushRaf(rafId);
    }

    init();
    loop();

    // pause/resume based on visibility
    const vis = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          running = entry.isIntersecting;
          if (running && !reduceMotion) loop();
        });
      },
      { threshold: 0.01 }
    );
    vis.observe(canvas.parentElement || canvas);

    window.addEventListener('resize', debounce(() => { setSize(); init(); }, 120), { passive: true });
    window.addEventListener('pagehide', () => { running = false; });
  }

  // === PROJECT SLIDERS ===
  // simple image crossfade and cleanup on pagehide
  function initProjectSliders() {
    const sliders = $$('.project-slider');
    if (!sliders.length) return;

    sliders.forEach((slider) => {
      const imgs = Array.from(slider.querySelectorAll('img'));
      if (imgs.length <= 1) return;
      let i = 0;
      const id = setInterval(() => {
        imgs[i].classList.remove('active');
        i = (i + 1) % imgs.length;
        imgs[i].classList.add('active');
      }, 2500);
      window.addEventListener('pagehide', () => clearInterval(id), { once: true });
    });
  }

  // === CONTACT FORM SUBMIT ===
  // Formspree submit handler with friendly status messages
  const form = document.querySelector('.contact-form');
  const status = document.querySelector('.form-status');

  if (form && status) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); // prevent page reload
      status.textContent = 'Sending...';

      const data = new FormData(form);

      try {
        const response = await fetch(form.action, {
          method: form.method,
          body: data,
          headers: { Accept: 'application/json' },
        });

        if (response.ok) {
          status.textContent = '✅ Message sent successfully!';
          form.reset();
          setTimeout(() => (status.textContent = ''), 3000); // clear after 3s
        } else {
          status.textContent = '❌ Something went wrong. Try again.';
        }
      } catch (error) {
        status.textContent = '⚠️ Network error. Please try again.';
      }
    });
  }

  // === PROJECTS GLOW LAYER + FLOATING WHEELS ===
  // glow follows mouse and floating wheels animate via RAF
  function initProjectsLayer() {
    const projectsSection = document.querySelector('.projects-section');
    if (!projectsSection) return;

    // create or select animation layer
    let animLayer = projectsSection.querySelector('.projects-animation-layer');
    if (!animLayer) {
      animLayer = document.createElement('div');
      animLayer.className = 'projects-animation-layer';
      animLayer.style.position = 'absolute';
      animLayer.style.top = '0';
      animLayer.style.left = '0';
      animLayer.style.width = '100%';
      animLayer.style.height = '100%';
      animLayer.style.zIndex = '0';
      animLayer.style.pointerEvents = 'none';
      projectsSection.prepend(animLayer);
    }

    // create glow element if missing
    let glow = animLayer.querySelector('.projects-glow');
    if (!glow) {
      glow = document.createElement('div');
      glow.className = 'projects-glow';
      glow.style.position = 'absolute';
      glow.style.width = '500px';
      glow.style.height = '500px';
      glow.style.borderRadius = '50%';
      glow.style.pointerEvents = 'none';
      glow.style.background = 'radial-gradient(circle, rgba(0,255,255,0.15), transparent 70%)';
      glow.style.filter = 'blur(120px)';
      glow.style.transition = 'transform 0.22s ease-out, opacity 0.22s ease';
      glow.style.opacity = '0';
      animLayer.appendChild(glow);
    }

    projectsSection.addEventListener('mouseenter', () => (glow.style.opacity = '1'), { passive: true });
    projectsSection.addEventListener('mouseleave', () => (glow.style.opacity = '0'), { passive: true });

    // glow follows mouse (throttled)
    projectsSection.addEventListener(
      'mousemove',
      throttle((e) => {
        const rect = projectsSection.getBoundingClientRect();
        const x = e.clientX - rect.left - glow.offsetWidth / 2;
        const y = e.clientY - rect.top - glow.offsetHeight / 2;
        glow.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      }, 16),
      { passive: true }
    );

    // wheel SVG template
    const wheelSVG = `
      <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <circle cx="50" cy="50" r="48" fill="url(#tireGradient)" stroke="#111" stroke-width="2"/>
        <circle cx="50" cy="50" r="28" fill="url(#rimGradient)" stroke="#999" stroke-width="1.5"/>
        <circle cx="50" cy="50" r="8" fill="#666" stroke="#333" stroke-width="1.5"/>
        <circle cx="50" cy="25" r="2.5" fill="#ccc"/>
        <circle cx="75" cy="50" r="2.5" fill="#ccc"/>
        <circle cx="50" cy="75" r="2.5" fill="#ccc"/>
        <circle cx="25" cy="50" r="2.5" fill="#ccc"/>
        <circle cx="65" cy="35" r="2.5" fill="#ccc"/>
        <circle cx="35" cy="65" r="2.5" fill="#ccc"/>
        <defs>
          <radialGradient id="rimGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#bbb"/>
            <stop offset="70%" stop-color="#888"/>
            <stop offset="100%" stop-color="#444"/>
          </radialGradient>
          <radialGradient id="tireGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#333"/>
            <stop offset="70%" stop-color="#111"/>
            <stop offset="100%" stop-color="#000"/>
          </radialGradient>
        </defs>
      </svg>
    `.trim();

    const wheelCount = lowPerf ? 3 : 6;
    const wheels = [];
    let wheelsRafId = null;

    // create floating wheels
    function initWheels() {
      // cleanup prior wheels
      animLayer.querySelectorAll('.floating-wheel').forEach((n) => n.remove());
      wheels.length = 0;

      const rect = projectsSection.getBoundingClientRect();
      for (let i = 0; i < wheelCount; i++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'floating-wheel';
        wrapper.style.position = 'absolute';
        wrapper.style.opacity = '0.28';
        wrapper.style.zIndex = '0';
        wrapper.style.pointerEvents = 'none';
        wrapper.style.transformOrigin = 'center';
        wrapper.style.left = '0';
        wrapper.style.top = '0';
        wrapper.innerHTML = wheelSVG;
        animLayer.appendChild(wrapper);

        const startX = Math.random() * Math.max(100, rect.width - 100);
        const startY = Math.random() * Math.max(100, rect.height - 100);

        wheels.push({
          el: wrapper,
          x: startX,
          y: startY,
          speedX: (Math.random() * 0.6 + 0.25) * (Math.random() < 0.5 ? 1 : -1),
          speedY: (Math.random() * 0.4 + 0.15) * (Math.random() < 0.5 ? 1 : -1),
          angle: Math.random() * 360,
          rotateSpeed: 0.15 + Math.random() * 0.35,
          scale: 0.6 + Math.random() * 0.8,
        });
      }
    }

    // animate wheels via RAF
    function animateWheels() {
      const rect = projectsSection.getBoundingClientRect();
      for (let i = 0; i < wheels.length; i++) {
        const w = wheels[i];
        w.x += w.speedX;
        w.y += w.speedY;
        w.angle += w.rotateSpeed;

        // bounce/clamp inside bounds
        if (w.x <= -80) w.speedX *= -1;
        if (w.x >= rect.width - 20) w.speedX *= -1;
        if (w.y <= -80) w.speedY *= -1;
        if (w.y >= rect.height - 20) w.speedY *= -1;

        w.el.style.transform = `translate(${Math.round(w.x)}px, ${Math.round(w.y)}px) rotate(${Math.round(
          w.angle
        )}deg) scale(${w.scale})`;
      }
      wheelsRafId = raf(animateWheels);
      pushRaf(wheelsRafId);
    }

    // run wheels only when visible
    const vis = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !reduceMotion) {
            initWheels();
            animateWheels();
          } else {
            if (wheelsRafId) {
              cancelRaf(wheelsRafId);
              wheelsRafId = null;
            }
          }
        });
      },
      { threshold: 0.01 }
    );
    vis.observe(projectsSection);

    // re-init on resize to keep within bounds
    window.addEventListener(
      'resize',
      debounce(() => {
        if (wheelsRafId) {
          cancelRaf(wheelsRafId);
          wheelsRafId = null;
        }
        initWheels();
        animateWheels();
      }, 180),
      { passive: true }
    );
  }
})(); // EOF

// === DISABLE MOUSE WHEEL SCROLL ===
window.addEventListener(
  'wheel',
  function (e) {
    e.preventDefault();
  },
  { passive: false }
);

// === OPTIONAL: BLOCK ARROW / PAGE KEYS & SPACE SCROLLING ===
window.addEventListener('keydown', function (e) {
  const keys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' '];
  if (keys.includes(e.key)) e.preventDefault();
});

// Disable all scroll and touch movement
window.addEventListener('scroll', () => window.scrollTo(0, 0));
window.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
