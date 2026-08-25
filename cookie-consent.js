(function () {
  const STORAGE_KEY = 'artblu_cookie_consent_v1';
  const SAMEDAY_SRC = 'https://cdn.sameday.ro/locker-plugin/lockerpluginsdk.js';

  function getChoice() {
    return localStorage.getItem(STORAGE_KEY) || '';
  }

  function hasOptionalConsent() {
    return getChoice() === 'all';
  }

  function hasAnyConsent() {
    return getChoice() === 'all' || getChoice() === 'essential';
  }

  function hideBanner() {
    const banner = document.getElementById('cookie-banner');
    if(!banner) return;
    banner.classList.remove('visible');
    setTimeout(() => banner.remove(), 320);
  }

  function loadSamedayScript() {
    if(window.LockerPlugin || document.getElementById('sameday-sdk')) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = 'sameday-sdk';
      script.src = SAMEDAY_SRC;
      script.async = true;
      script.onload = () => {
        window.dispatchEvent(new Event('artblu-sameday-ready'));
        resolve();
      };
      script.onerror = () => reject(new Error('Sameday SDK failed to load'));
      document.head.appendChild(script);
    });
  }

  function loadOptionalScripts() {
    if(document.documentElement.dataset.page === 'checkout' || document.body.dataset.page === 'checkout'){
      loadSamedayScript().catch(() => {});
    }
  }

  function saveChoice(choice) {
    localStorage.setItem(STORAGE_KEY, choice);
    hideBanner();
    if(choice === 'all') loadOptionalScripts();
    window.dispatchEvent(new CustomEvent('artblu-cookie-consent', { detail: { choice } }));
  }

  function renderBanner() {
    if(hasAnyConsent()){
      if(hasOptionalConsent()) loadOptionalScripts();
      return;
    }
    if(document.getElementById('cookie-banner')) return;

    const banner = document.createElement('aside');
    banner.id = 'cookie-banner';
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Consimțământ cookie-uri');
    banner.innerHTML = `
      <div class="inner">
        <p>
          <strong>Cookie-uri și servicii terțe.</strong>
          Folosim cookie-uri și stocare locală pentru coș, autentificare și comenzi (<strong>Supabase</strong>),
          plăți card (<strong>Stripe</strong>, la checkout) și harta Easybox (<strong>Sameday</strong>, doar dacă accepți opționale).
          Detalii în <a href="confidentialitate.html#cookie-uri">politica de confidențialitate</a>.
        </p>
        <div class="actions">
          <button type="button" class="btn-essential" id="cookie-essential-btn">Doar necesare</button>
          <button type="button" class="btn-accept" id="cookie-accept-btn">Accept toate</button>
        </div>
      </div>`;
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add('visible'));

    banner.querySelector('#cookie-accept-btn')?.addEventListener('click', () => saveChoice('all'));
    banner.querySelector('#cookie-essential-btn')?.addEventListener('click', () => saveChoice('essential'));
  }

  window.artbluCookieConsent = {
    getChoice,
    hasOptionalConsent,
    hasAnyConsent,
    loadSamedayScript,
    loadOptionalScripts
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderBanner);
  else renderBanner();
})();
