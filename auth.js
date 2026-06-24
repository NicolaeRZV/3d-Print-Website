(function () {
  const SUPABASE_URL = 'https://tilfngrtldwevtiilxpq.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_A3fpQb9LjJb8XySpIJyJeg_gcjPOs3m';

  const authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function getDisplayName(user) {
    if (!user) return 'Cont';
    return user.user_metadata?.full_name || user.email?.split('@')[0] || 'Cont';
  }

  async function getCurrentUser() {
    const { data: { session } } = await authClient.auth.getSession();
    return session?.user ?? null;
  }

  async function signIn(email, password) {
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }

  async function signUp(email, password, fullName) {
    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName || '' } }
    });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await authClient.auth.signOut();
    if (error) throw error;
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
    });
  }

  authClient.auth.onAuthStateChange(() => updateAuthHeader());
  document.addEventListener('DOMContentLoaded', updateAuthHeader);

  window.getDisplayName = getDisplayName;
  window.getCurrentUser = getCurrentUser;
  window.signIn = signIn;
  window.signUp = signUp;
  window.signOut = signOut;
  window.escapeHtml = escapeHtml;
})();
