/* Shared motion for every screen; content remains usable without animation APIs. */
(() => {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let observer;
  let frame = 0;
  let progress;
  const running = new Set();
  const animate = (element, keyframes, options = {}) => {
    if (!element || preference.matches || !element.animate) return;
    const animation = element.animate(keyframes, {
      duration: 560, easing: 'cubic-bezier(.2,.75,.25,1)', ...options
    });
    running.add(animation);
    animation.finished.then(() => running.delete(animation), () => running.delete(animation));
    return animation;
  };
  const reveal = (element, delay = 0) => animate(element, [
    { opacity: 0, transform: 'translateY(20px)' },
    { opacity: 1, transform: 'translateY(0)' }
  ], { delay, fill: 'backwards' });
  function reset() {
    observer?.disconnect();
    running.forEach(animation => animation.cancel());
    running.clear();
  }
  function updateProgress() {
    frame = 0;
    if (!progress) return;
    const range = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${range > 0 ? Math.min(1, Math.max(0, window.scrollY / range)) : 0})`;
  }
  function mount() {
    reset();
    if (!progress) {
      progress = document.createElement('div');
      progress.className = 'reading-progress';
      progress.setAttribute('aria-hidden', 'true');
      document.body.append(progress);
    }
    updateProgress();
    if (preference.matches) return;
    const root = document.querySelector('#app');
    // A short entrance also covers forms, checkout, tracking and error screens.
    reveal(root.firstElementChild);
    const visible = [];
    const targets = root.querySelectorAll('nav, .sidebar, .main > header, .hero > div, .features article, .auth-card, .welcome, .stat, .panel, .storehero > *, .storecontent > h2, .food, .admin > header, .admin > h1, footer');
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        const entering = entries.filter(entry => entry.isIntersecting);
        entering.forEach((entry, index) => {
          reveal(entry.target, Math.min(index, 5) * 65);
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.08 });
    }
    targets.forEach(element => {
      const rect = element.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) visible.push(element);
      else observer?.observe(element);
    });
    visible.forEach((element, index) => reveal(element, Math.min(index, 7) * 55));
    root.querySelectorAll('.hero-art span, .hero-art i').forEach((element, index) => {
      animate(element, [
        { transform: 'translateY(0) rotate(-5deg)' },
        { transform: 'translateY(-13px) rotate(5deg)' },
        { transform: 'translateY(0) rotate(-5deg)' }
      ], { duration: 4200 + index * 700, iterations: 2, easing: 'ease-in-out', delay: 450 });
    });
  }
  document.addEventListener('pointerover', event => {
    if (!finePointer.matches || !(event.target instanceof Element)) return;
    const target = event.target.closest('.btn, .nav, .plan, .text-btn');
    if (!target || target.contains(event.relatedTarget)) return;
    animate(target, [{ transform: 'translateY(0)' }, { transform: 'translateY(-3px)' }, { transform: 'translateY(0)' }], { duration: 330 });
  });
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest('button, a.btn');
    if (!target || target.disabled) return;
    animate(target, [{ transform: 'scale(1)' }, { transform: 'scale(.95)' }, { transform: 'scale(1)' }], { duration: 240 });
  }, true);
  document.addEventListener('invalid', event => {
    animate(event.target, [
      { transform: 'translateX(0)' }, { transform: 'translateX(-5px)' },
      { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }
    ], { duration: 260 });
  }, true);
  window.addEventListener('scroll', () => {
    if (!frame) frame = requestAnimationFrame(updateProgress);
  }, { passive: true });
  window.addEventListener('resize', () => {
    if (!frame) frame = requestAnimationFrame(updateProgress);
  }, { passive: true });
  preference.addEventListener('change', mount);
  window.NexoraMotion = { mount };
})();
