(function () {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initReveal() {
    const nodes = document.querySelectorAll(".reveal");
    if (!nodes.length) return;

    if (reduce || !("IntersectionObserver" in window)) {
      nodes.forEach((el) => el.classList.add("in-view"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
    );

    nodes.forEach((el) => observer.observe(el));
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function scrollToY(targetY, duration) {
    const start = window.scrollY;
    const dist = targetY - start;
    if (Math.abs(dist) < 2) return;
    const t0 = performance.now();

    function frame(now) {
      const t = Math.min(1, (now - t0) / duration);
      window.scrollTo(0, start + dist * easeInOutCubic(t));
      if (t < 1) requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  function headerOffset() {
    const header = document.querySelector(".site-header");
    return header ? header.offsetHeight + 8 : 76;
  }

  function initSmoothAnchors() {
    if (reduce) return;

    document.querySelectorAll('a[href*="#"]').forEach((link) => {
      const href = link.getAttribute("href");
      const hash = href && href.split("#")[1];
      if (!hash) return;
      const samePage = !href.split("#")[0] || link.pathname === location.pathname;

      link.addEventListener("click", (event) => {
        if (!samePage) return;
        const target = document.getElementById(hash);
        if (!target) return;
        event.preventDefault();
        const top = target.getBoundingClientRect().top + window.scrollY - headerOffset();
        scrollToY(top, 900);
        history.replaceState(null, "", "#" + hash);
      });
    });

    if (location.hash.length > 1) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) {
        requestAnimationFrame(() => {
          const top = target.getBoundingClientRect().top + window.scrollY - headerOffset();
          scrollToY(top, 900);
        });
      }
    }
  }

  function initGallery() {
    const gallery = document.querySelector(".gallery");
    const stage = document.querySelector(".stage");
    if (!gallery || !stage) return;

    const items = Array.from(gallery.querySelectorAll(".gallery-item"));
    const works = items.map((btn) => ({
      src: btn.dataset.src,
      title: btn.dataset.title || "",
    }));

    const imgPrev = stage.querySelector(".stage-img.is-prev");
    const imgCurrent = stage.querySelector(".stage-img.is-current");
    const imgNext = stage.querySelector(".stage-img.is-next");
    const caption = stage.querySelector(".stage-caption");
    const count = stage.querySelector(".stage-count");
    const strip = stage.querySelector(".stage-strip");
    const btnPrev = stage.querySelector(".stage-nav.prev");
    const btnNext = stage.querySelector(".stage-nav.next");
    const btnClose = stage.querySelector(".stage-close");

    let index = 0;
    let lastFocus = null;

    works.forEach((work, i) => {
      const thumb = document.createElement("button");
      thumb.type = "button";
      thumb.setAttribute("aria-label", "Show " + work.title);
      const img = document.createElement("img");
      img.src = work.src;
      img.alt = "";
      thumb.appendChild(img);
      thumb.addEventListener("click", () => show(i));
      strip.appendChild(thumb);
    });

    const thumbs = Array.from(strip.children);

    function wrap(i) {
      const n = works.length;
      return ((i % n) + n) % n;
    }

    function preload(i) {
      const image = new Image();
      image.src = works[wrap(i)].src;
    }

    function show(i) {
      index = wrap(i);
      const prev = works[wrap(index - 1)];
      const current = works[index];
      const next = works[wrap(index + 1)];

      imgPrev.src = prev.src;
      imgPrev.alt = prev.title;
      imgCurrent.src = current.src;
      imgCurrent.alt = current.title;
      imgNext.src = next.src;
      imgNext.alt = next.title;

      caption.textContent = current.title;
      count.textContent = index + 1 + " / " + works.length;

      thumbs.forEach((el, n) => el.classList.toggle("is-active", n === index));
      const active = thumbs[index];
      if (active) {
        active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
      }

      preload(index + 1);
      preload(index - 1);
    }

    function open(i) {
      lastFocus = document.activeElement;
      stage.classList.add("is-open");
      stage.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      show(i);
      btnClose.focus();
    }

    function close() {
      stage.classList.remove("is-open");
      stage.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    items.forEach((btn, i) => {
      btn.addEventListener("click", () => open(i));
    });

    const hash = location.hash.match(/^#view-(\d+)$/);
    if (hash) {
      const i = parseInt(hash[1], 10);
      if (i >= 0 && i < works.length) open(i);
    }

    btnPrev.addEventListener("click", () => show(index - 1));
    btnNext.addEventListener("click", () => show(index + 1));
    btnClose.addEventListener("click", close);

    stage.addEventListener("click", (event) => {
      if (event.target === stage.querySelector(".stage-viewport")) close();
    });

    document.addEventListener("keydown", (event) => {
      if (!stage.classList.contains("is-open")) return;
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") show(index - 1);
      if (event.key === "ArrowRight") show(index + 1);
    });

    let startX = 0;
    stage.addEventListener(
      "touchstart",
      (event) => {
        startX = event.changedTouches[0].clientX;
      },
      { passive: true }
    );
    stage.addEventListener(
      "touchend",
      (event) => {
        const dx = event.changedTouches[0].clientX - startX;
        if (Math.abs(dx) < 40) return;
        if (dx > 0) show(index - 1);
        else show(index + 1);
      },
      { passive: true }
    );
  }

  initReveal();
  initSmoothAnchors();
  initGallery();
})();
