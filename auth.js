(function () {
  const SUPABASE_URL = 'https://tilfngrtldwevtiilxpq.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_A3fpQb9LjJb8XySpIJyJeg_gcjPOs3m';

  const authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  });

  function siteOrigin() {
    let base = window.location.origin;
    const path = window.location.pathname;
    if (path.endsWith('.html')) base += path.replace(/\/[^/]+$/, '');
    else if (path !== '/') base += path.replace(/\/$/, '');
    return base;
  }

  function getDisplayName(user) {
    if (!user) return 'Cont';
    return user.user_metadata?.full_name || user.email?.split('@')[0] || 'Cont';
  }

  function mapAuthError(err) {
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('invalid login credentials')) return 'Email sau parolă greșită.';
    if (msg.includes('email not confirmed')) return 'Confirmă mai întâi emailul (verifică inbox / spam), apoi autentifică-te.';
    if (msg.includes('user already registered')) return 'Există deja un cont cu acest email. Autentifică-te sau resetează parola.';
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
      throw e;
    }
    return data.user;
  }

  async function signUp(email, password, fullName) {
    const redirectTo = `${siteOrigin()}/login.html?confirmed=1`;
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
    // Supabase can return a fake user with empty identities when email already exists
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error('Există deja un cont cu acest email. Autentifică-te sau resetează parola.');
    }
    return data;
  }

  async function resetPassword(email) {
    const redirectTo = `${siteOrigin()}/login.html?reset=1`;
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

  window.artbluAuth = authClient;
  window.getDisplayName = getDisplayName;
  window.getCurrentUser = getCurrentUser;
  window.getSession = getSession;
  window.signIn = signIn;
  window.signUp = signUp;
  window.signOut = signOut;
  window.resetPassword = resetPassword;
  window.updatePassword = updatePassword;
  window.updateProfile = updateProfile;
  window.mapAuthError = mapAuthError;
  window.escapeHtml = escapeHtml;
  window.artbluSiteOrigin = siteOrigin;
})();
