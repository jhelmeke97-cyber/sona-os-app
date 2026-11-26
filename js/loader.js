'use strict';

(function() {
  let guardTimer = null;
  let delayTimer = null;
  let ringPng = '';
  let wordmarkPng = '';
  let canvasBusy = false;
  let animRaf = null;
  let animStart = 0;

  function applyImages(rPng, wPng) {
    const ghostEl = document.getElementById('sonaLoaderRingGhost');
    const activeEl = document.getElementById('sonaLoaderRingActive');
    const wordEl = document.getElementById('sonaLoaderWordmark');
    if (ghostEl && rPng) { ghostEl.src = rPng; ghostEl.classList.add('ready'); }
    if (activeEl && rPng) { activeEl.src = rPng; activeEl.classList.add('ready'); }
    if (wordEl && wPng) { wordEl.src = wPng; wordEl.classList.add('ready'); }
    startAnim();
  }

  function startAnim() {
    const loader = document.getElementById('sonaStartupLoader');
    const ringEl = document.getElementById('sonaLoaderRingActive');
    if (!loader || loader.classList.contains('is-hidden') || !ringEl) return;
    if (animRaf) return;
    animStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    function step(now) {
      const cur = document.getElementById('sonaStartupLoader');
      if (!cur || cur.classList.contains('is-hidden')) {
        animRaf = null;
        return;
      }
      const t = ((now - animStart) % 1650) / 1650;
      const angle = (t * 360).toFixed(1);
      const grad = 'conic-gradient(from ' + angle + 'deg at 52% 50%, transparent 0deg, rgba(0,0,0,0.08) 95deg, rgba(0,0,0,0.92) 250deg, #000 322deg, transparent 360deg)';
      ringEl.style.webkitMaskImage = grad;
      ringEl.style.maskImage = grad;
      animRaf = requestAnimationFrame(step);
    }

    if (typeof requestAnimationFrame === 'function') {
      animRaf = requestAnimationFrame(step);
    }
  }

  function stopAnim() {
    if (animRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(animRaf);
    }
    animRaf = null;
  }

  function initLogo() {
    if (ringPng && wordmarkPng) {
      applyImages(ringPng, wordmarkPng);
      return;
    }
    if (canvasBusy || typeof Image === 'undefined') return;
    canvasBusy = true;

    try {
      const img = new Image();
      img.onload = function() {
        try {
          const w = img.naturalWidth || 512;
          const h = img.naturalHeight || 512;
          const cSrc = document.createElement('canvas');
          cSrc.width = w;
          cSrc.height = h;
          const ctxSrc = cSrc.getContext('2d');
          ctxSrc.drawImage(img, 0, 0, w, h);
          const srcData = ctxSrc.getImageData(0, 0, w, h).data;

          const cRing = document.createElement('canvas');
          cRing.width = w;
          cRing.height = h;
          const ctxRing = cRing.getContext('2d');
          const ringData = ctxRing.createImageData(w, h);
          const dR = ringData.data;

          const cWord = document.createElement('canvas');
          cWord.width = w;
          cWord.height = h;
          const ctxWord = cWord.getContext('2d');
          const wordData = ctxWord.createImageData(w, h);
          const dW = wordData.data;

          const wordMaxX = Math.round(w * 0.63);
          const wordMinY = Math.round(h * 0.415);
          const wordMaxY = Math.round(h * 0.565);

          for (let py = 0; py < h; py++) {
            const inWordY = py >= wordMinY && py <= wordMaxY;
            for (let px = 0; px < w; px++) {
              const idx = (py * w + px) * 4;
              const lum = 0.299 * srcData[idx] + 0.587 * srcData[idx + 1] + 0.114 * srcData[idx + 2];
              if (lum < 26) continue;
              const alpha = Math.min(255, Math.round(((lum - 26) / 185) * 255));
              if (inWordY && px <= wordMaxX) {
                dW[idx] = 245; dW[idx + 1] = 236; dW[idx + 2] = 215; dW[idx + 3] = alpha;
              } else {
                dR[idx] = 245; dR[idx + 1] = 236; dR[idx + 2] = 215; dR[idx + 3] = alpha;
              }
            }
          }

          ctxRing.putImageData(ringData, 0, 0);
          ctxWord.putImageData(wordData, 0, 0);
          ringPng = cRing.toDataURL('image/png');
          wordmarkPng = cWord.toDataURL('image/png');
          applyImages(ringPng, wordmarkPng);
        } catch (_e) {
        } finally {
          canvasBusy = false;
        }
      };
      img.onerror = function() { canvasBusy = false; };
      img.src = './assets/sona-logo.jpg';
    } catch (_e2) {
      canvasBusy = false;
    }
  }

  function show(delayMs) {
    if (delayTimer) { clearTimeout(delayTimer); delayTimer = null; }
    const openNow = function() {
      delayTimer = null;
      const el = document.getElementById('sonaStartupLoader');
      if (el) el.classList.remove('is-hidden');
      initLogo();
      startAnim();
      if (guardTimer) clearTimeout(guardTimer);
      guardTimer = setTimeout(hide, 18000);
    };
    if (delayMs && delayMs > 0) {
      delayTimer = setTimeout(openNow, delayMs);
    } else {
      openNow();
    }
  }

  function hide() {
    if (delayTimer) { clearTimeout(delayTimer); delayTimer = null; }
    if (guardTimer) { clearTimeout(guardTimer); guardTimer = null; }
    const el = document.getElementById('sonaStartupLoader');
    if (el) el.classList.add('is-hidden');
    stopAnim();
  }

  window.SonaLoader = { init: initLogo, show: show, hide: hide };
})();
