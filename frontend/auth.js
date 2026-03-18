(function () {
  const SUPABASE_URL = window.FF_SUPABASE_URL || 'https://itymnewbpzmjtchuztvg.supabase.co';
  const SUPABASE_ANON_KEY = window.FF_SUPABASE_ANON_KEY || 'sb_publishable_jUHZii3ud-f4qdH2aLvT_g_l_wODuyZ';
  const API_URL = window.FF_API_URL || '';

  let supabaseClient = null;
  let currentSession = null;
  const listeners = [];
  let authModal = null;
  let authMessage = null;

  function configMissing() {
    return !SUPABASE_URL || !SUPABASE_ANON_KEY ||
      SUPABASE_URL.includes('YOUR_') || SUPABASE_ANON_KEY.includes('YOUR_');
  }

  function getClient() {
    return supabaseClient;
  }

  function apiUrl(path) {
    if (!API_URL || API_URL.includes('YOUR_BACKEND')) return path;
    const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
    return `${base}${path}`;
  }

  function notify() {
    listeners.forEach((cb) => cb(currentSession));
  }

  function renderAuthState() {
    const meta = currentSession?.user?.user_metadata || {};
    const displayName = meta.full_name || meta.name || currentSession?.user?.email || 'Guest';

    document.querySelectorAll('[data-auth-show="signed-in"]').forEach((el) => {
      el.style.display = currentSession ? '' : 'none';
    });
    document.querySelectorAll('[data-auth-show="signed-out"]').forEach((el) => {
      el.style.display = currentSession ? 'none' : '';
    });

    document.querySelectorAll('[data-auth-user]').forEach((el) => {
      el.textContent = displayName;
    });
    document.querySelectorAll('[data-auth-avatar]').forEach((el) => {
      const initial = displayName.trim().charAt(0).toUpperCase() || 'G';
      el.textContent = initial;
    });
  }

  function setAuthMessage(text, isError) {
    if (!authMessage) return;
    authMessage.textContent = text || '';
    authMessage.style.color = isError ? '#ff5c7a' : '#95a3b3';
  }

  function getCredentials() {
    const emailEl = document.getElementById('ff-auth-email');
    const passEl = document.getElementById('ff-auth-password');
    return {
      email: emailEl ? emailEl.value.trim() : '',
      password: passEl ? passEl.value : '',
    };
  }

  function closeAuthModal() {
    if (authModal) authModal.style.display = 'none';
  }

  function ensureModal() {
    if (document.getElementById('ff-auth-modal')) {
      authModal = document.getElementById('ff-auth-modal');
      authMessage = document.getElementById('ff-auth-message');
      return;
    }

    const style = document.createElement('style');
    style.id = 'ff-auth-style';
    style.textContent = `
      #ff-auth-modal { position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
        background: rgba(4,8,12,0.65); backdrop-filter: blur(6px); z-index: 9999; }
      #ff-auth-card { width: 360px; max-width: calc(100vw - 32px);
        background: #0f1622; border: 1px solid rgba(62,230,199,0.2); border-radius: 16px; padding: 22px; color: #eef4f8;
        font-family: 'Spline Sans', sans-serif; box-shadow: 0 30px 60px rgba(0,0,0,0.45); }
      #ff-auth-card h3 { margin: 0 0 6px; font-size: 1.2rem; font-family: 'Space Grotesk', sans-serif; }
      #ff-auth-card p { margin: 0 0 16px; color: #95a3b3; font-size: 0.9rem; }
      .ff-auth-field { display: grid; gap: 8px; margin-bottom: 12px; }
      .ff-auth-label { font-size: 0.7rem; letter-spacing: 0.08em; color: #95a3b3; font-family: 'JetBrains Mono', monospace; }
      .ff-auth-input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
        border-radius: 10px; padding: 10px 12px; color: #eef4f8; font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; }
      .ff-auth-actions { display: grid; gap: 10px; margin-top: 6px; }
      .ff-auth-btn { background: #3ee6c7; color: #041014; border: none; border-radius: 10px; padding: 10px 12px;
        font-weight: 700; font-family: 'Space Grotesk', sans-serif; cursor: pointer; }
      .ff-auth-btn.secondary { background: transparent; color: #eef4f8; border: 1px solid rgba(255,255,255,0.2); }
      .ff-auth-link { background: transparent; border: none; color: #95a3b3; cursor: pointer; font-size: 0.8rem; }
      .ff-auth-link:hover { color: #eef4f8; }
      .ff-auth-close { background: transparent; border: none; color: #95a3b3; cursor: pointer; float: right; }
      #ff-auth-message { min-height: 18px; font-size: 0.8rem; margin-top: 8px; color: #95a3b3; }
    `;
    document.head.appendChild(style);

    const modal = document.createElement('div');
    modal.id = 'ff-auth-modal';
    modal.innerHTML = `
      <div id="ff-auth-card">
        <button class="ff-auth-close" data-ff-auth-close>Close</button>
        <h3>Sign in</h3>
        <p>Use email and password to access your workspace.</p>
        <div class="ff-auth-field">
          <div class="ff-auth-label">EMAIL</div>
          <input class="ff-auth-input" id="ff-auth-email" type="email" placeholder="you@company.com" />
        </div>
        <div class="ff-auth-field">
          <div class="ff-auth-label">PASSWORD</div>
          <input class="ff-auth-input" id="ff-auth-password" type="password" placeholder="••••••••" />
        </div>
        <div class="ff-auth-actions">
          <button class="ff-auth-btn" data-ff-auth-signin>Sign in</button>
          <button class="ff-auth-btn secondary" data-ff-auth-create>Create account</button>
          <button class="ff-auth-link" data-ff-auth-forgot>Forgot password?</button>
        </div>
        <div id="ff-auth-message"></div>
      </div>
    `;
    document.body.appendChild(modal);

    authModal = modal;
    authMessage = document.getElementById('ff-auth-message');

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAuthModal();
    });
    modal.querySelector('[data-ff-auth-close]').addEventListener('click', closeAuthModal);
    modal.querySelector('[data-ff-auth-signin]').addEventListener('click', signInWithPassword);
    modal.querySelector('[data-ff-auth-create]').addEventListener('click', () => {
      window.location = 'signup.html';
    });
    modal.querySelector('[data-ff-auth-forgot]').addEventListener('click', resetPassword);
    modal.querySelector('#ff-auth-password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') signInWithPassword();
    });
  }

  function openAuthModal() {
    ensureModal();
    setAuthMessage('');
    authModal.style.display = 'flex';
    const emailEl = document.getElementById('ff-auth-email');
    if (emailEl) emailEl.focus();
  }

  async function signInWithPassword() {
    if (!supabaseClient) {
      alert('Supabase is not configured. Set SUPABASE URL and ANON KEY in auth.js.');
      return;
    }
    const { email, password } = getCredentials();
    if (!email || !password) {
      setAuthMessage('Email and password are required.', true);
      return;
    }
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthMessage(error.message || 'Sign in failed.', true);
      return;
    }
    closeAuthModal();
  }

  async function signUpWithDetails(details) {
    if (!supabaseClient) {
      alert('Supabase is not configured. Set SUPABASE URL and ANON KEY in auth.js.');
      return { error: { message: 'Supabase not configured' } };
    }
    const redirectTo = window.location.origin + window.location.pathname;
    const payload = {
      email: details.email,
      password: details.password,
      options: {
        data: {
          full_name: details.fullName || '',
          company: details.company || '',
          country: details.country || '',
          currency: details.currency || '',
        },
        emailRedirectTo: redirectTo,
      },
    };
    return supabaseClient.auth.signUp(payload);
  }

  async function resetPassword() {
    if (!supabaseClient) {
      alert('Supabase is not configured. Set SUPABASE URL and ANON KEY in auth.js.');
      return;
    }
    const { email } = getCredentials();
    if (!email) {
      setAuthMessage('Enter your email to reset your password.', true);
      return;
    }
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) {
      setAuthMessage(error.message || 'Password reset failed.', true);
      return;
    }
    setAuthMessage('Password reset email sent. Check your inbox.', false);
  }

  async function signOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
  }

  async function getAccessToken() {
    if (!supabaseClient) return null;
    const { data } = await supabaseClient.auth.getSession();
    return data?.session?.access_token || null;
  }

  function onChange(cb) {
    listeners.push(cb);
    cb(currentSession);
  }

  async function init() {
    if (!window.supabase || configMissing()) {
      renderAuthState();
      notify();
      return;
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { data } = await supabaseClient.auth.getSession();
    currentSession = data?.session || null;
    renderAuthState();
    notify();

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      currentSession = session || null;
      renderAuthState();
      notify();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-auth-action="login"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        openAuthModal();
      });
    });
    document.querySelectorAll('[data-auth-action="signup"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        window.location = 'signup.html';
      });
    });
    document.querySelectorAll('[data-auth-action="logout"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        signOut();
      });
    });

    init();
  });

  window.FF_AUTH = {
    getClient,
    onChange,
    getAccessToken,
    openAuthModal,
    signInWithPassword,
    signUpWithDetails,
    resetPassword,
    signOut,
  };

  window.FF_API = { url: apiUrl };
})();
