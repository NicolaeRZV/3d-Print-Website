(function () {
  const SUPABASE_URL = 'https://tilfngrtldwevtiilxpq.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_A3fpQb9LjJb8XySpIJyJeg_gcjPOs3m';

  // Live shop URL — email links always use this (not localhost).
  const SITE_URL = 'https://artblu.ro';

  // Admin panel: add every admin email here (lowercase). Or set app_metadata.role = "admin" in Supabase.
  const ADMIN_EMAILS = [
    'contact@artblu.ro',
    `costachehoria888@gmail.com`
  ];

  const AUTH_STORAGE_KEY = 'artblu-auth';

  function getLoginRedirect() {
    try {
      const raw = new URLSearchParams(window.location.search).get('redirect') || '';
      const path = String(raw).trim();
      if (!path || path.includes('://') || path.startsWith('//') || path.includes('..')) return null;
      if (!/^[a-z0-9._-]+\.html$/i.test(path)) return null;
      return path;
    } catch (_) {
      return null;
    }
  }

  function postLoginUrl() {
    return getLoginRedirect() || 'account.html';
  }

  window.getLoginRedirect = getLoginRedirect;
  window.postLoginUrl = postLoginUrl;

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('[artblu] Supabase SDK missing — load @supabase/supabase-js before auth.js');
    window.artbluAuth = null;
    window.artbluAuthInitError = 'Supabase SDK missing';
    return;
  }

  const authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: AUTH_STORAGE_KEY,
      storage: window.localStorage
    }
  });

  window.artbluAuth = authClient;

  function siteOrigin() {
    if (SITE_URL) return SITE_URL.replace(/\/$/, '');
    let base = window.location.origin;
    const path = window.location.pathname;
    if (path.endsWith('.html')) base += path.replace(/\/[^/]+$/, '');
    else if (path !== '/') base += path.replace(/\/$/, '');
    return base;
  }

  function authCallbackUrl() {
    return `${siteOrigin()}/auth-callback.html`;
  }

  function authPageUrl(query) {
    const base = siteOrigin();
    return query ? `${base}/login.html?${query}` : `${base}/login.html`;
  }

  function isAdminUser(user) {
    if (!user) return false;
    if (user.app_metadata?.role === 'admin') return true;
    if (user.user_metadata?.is_admin === true) return true;
    const email = String(user.email || '').trim().toLowerCase();
    if (!email) return false;
    return ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email);
  }

  function getDisplayName(user) {
    if (!user) return 'Cont';
    return user.user_metadata?.full_name || user.email?.split('@')[0] || 'Cont';
  }

  function mapAuthError(err) {
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('invalid login credentials')) return 'Email sau parolă greșită.';
    if (msg.includes('email not confirmed')) return 'Confirmă mai întâi emailul (verifică inbox / spam), apoi autentifică-te.';
    if (msg.includes('user already registered')) return 'Există deja un cont cu acest email. Autentifică-te sau retrimite emailul de confirmare.';
    if (msg.includes('password should be at least')) return 'Parola trebuie să aibă minim 6 caractere.';
    if (msg.includes('unable to validate email')) return 'Adresa de email nu este validă.';
    if (msg.includes('signup is disabled')) return 'Înregistrările sunt dezactivate momentan.';
    if (msg.includes('rate limit') || msg.includes('too many')) return 'Prea multe încercări. Așteaptă un minut și încearcă din nou.';
    if (msg.includes('network') || msg.includes('fetch')) return 'Problemă de conexiune. Verifică internetul.';
    return err?.message || 'A apărut o eroare. Încearcă din nou.';
  }

  async function getCurrentUser() {
    const { data: { user }, error } = await authClient.auth.getUser();
    if (error) return null;
    return user ?? null;
  }

  async function getSession() {
    const { data: { session } } = await authClient.auth.getSession();
    return session ?? null;
  }

  async function signIn(email, password) {
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error) {
      const e = new Error(mapAuthError(error));
      e.cause = error;
      e.code = error.message || '';
      throw e;
    }
    return data.user;
  }

  async function signUp(email, password, fullName) {
    const redirectTo = authCallbackUrl();
    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName || '' },
        emailRedirectTo: redirectTo
      }
    });
    if (error) {
      const e = new Error(mapAuthError(error));
      e.cause = error;
      throw e;
    }
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      const dup = new Error('Există deja un cont cu acest email. Autentifică-te sau retrimite emailul de confirmare.');
      dup.code = 'already_registered';
      throw dup;
    }
    return data;
  }

  async function resendConfirmation(email) {
    const redirectTo = authCallbackUrl();
    const { error } = await authClient.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectTo }
    });
    if (error) {
      const e = new Error(mapAuthError(error));
      e.cause = error;
      throw e;
    }
  }

  async function resetPassword(email) {
    const redirectTo = authCallbackUrl();
    const { error } = await authClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      const e = new Error(mapAuthError(error));
      e.cause = error;
      throw e;
    }
  }

  async function updatePassword(newPassword) {
    const { data, error } = await authClient.auth.updateUser({ password: newPassword });
    if (error) {
      const e = new Error(mapAuthError(error));
      e.cause = error;
      throw e;
    }
    return data.user;
  }

  async function updateProfile(fullName) {
    const { data, error } = await authClient.auth.updateUser({
      data: { full_name: fullName || '' }
    });
    if (error) {
      const e = new Error(mapAuthError(error));
      e.cause = error;
      throw e;
    }
    return data.user;
  }

  async function signOut() {
    const { error } = await authClient.auth.signOut();
    if (error) {
      const e = new Error(mapAuthError(error));
      e.cause = error;
      throw e;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function updateAuthHeader() {
    const link = document.getElementById('account-link');
    if (!link) return;

    getCurrentUser().then(user => {
      const label = link.querySelector('.label');
      if (user) {
        link.href = 'account.html';
        link.setAttribute('aria-label', 'Contul meu');
        if (label) label.innerHTML = `<small>Salut</small>${escapeHtml(getDisplayName(user))}`;
      } else {
        link.href = 'login.html';
        link.setAttribute('aria-label', 'Autentificare');
        if (label) label.innerHTML = '<small>Autentificare</small>Cont';
      }
    }).catch(() => {});
  }

  authClient.auth.onAuthStateChange(() => updateAuthHeader());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateAuthHeader);
  } else {
    updateAuthHeader();
  }

  window.artbluSiteUrl = SITE_URL;
  window.artbluAdminEmails = ADMIN_EMAILS;
  window.getDisplayName = getDisplayName;
  window.getCurrentUser = getCurrentUser;
  window.getSession = getSession;
  window.isAdminUser = isAdminUser;
  window.signIn = signIn;
  window.signUp = signUp;
  window.signOut = signOut;
  window.resetPassword = resetPassword;
  window.resendConfirmation = resendConfirmation;
  window.updatePassword = updatePassword;
  window.updateProfile = updateProfile;
  window.mapAuthError = mapAuthError;
  window.escapeHtml = escapeHtml;
  window.artbluSiteOrigin = siteOrigin;
  window.authPageUrl = authPageUrl;
  window.artbluAuthPageUrl = authPageUrl;
  window.artbluAuthCallbackUrl = authCallbackUrl;
})();
