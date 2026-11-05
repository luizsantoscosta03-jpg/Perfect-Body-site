(function () {
  'use strict';
  const authBox = document.getElementById('bp-auth');
  const authForm = document.getElementById('bp-auth-form');
  const nameWrap = document.getElementById('bp-name-wrap');
  const msg = document.getElementById('bp-auth-msg');
  const studentWorkouts = document.getElementById('bp-student-workouts');
  const signupBtn = document.getElementById('bp-signup');
  const loginBtn = document.getElementById('bp-login');
  const nameInput = document.getElementById('bp-name');
  const emailInput = document.getElementById('bp-email');
  const passwordInput = document.getElementById('bp-password');
  let mode = 'login';
  let client = null;

  function message(text) { msg.textContent = text; msg.hidden = !text; }
  function busy(value) { signupBtn.disabled = value; loginBtn.disabled = value; }
  function configReady() {
    return window.BP_SUPABASE_URL && window.BP_SUPABASE_ANON_KEY &&
      !window.BP_SUPABASE_URL.includes('COLE_AQUI') && !window.BP_SUPABASE_ANON_KEY.includes('COLE_AQUI');
  }
  function setMode(next) {
    mode = next;
    nameWrap.hidden = next !== 'signup';
    nameInput.required = next === 'signup';
    passwordInput.autocomplete = next === 'signup' ? 'new-password' : 'current-password';
    signupBtn.classList.toggle('primary', next === 'signup');
    loginBtn.classList.toggle('primary', next === 'login');
    message(next === 'signup' ? 'Crie sua conta de aluno. Use um e-mail válido e uma senha com pelo menos 8 caracteres.' : 'Entre com seu e-mail e senha.');
  }
  function explainError(error) {
    const text = (error && error.message) || 'Não foi possível concluir. Tente novamente.';
    if (/Invalid login credentials/i.test(text)) return 'E-mail ou senha incorretos.';
    if (/User already registered/i.test(text)) return 'Este e-mail já possui cadastro. Tente entrar.';
    if (/Email not confirmed/i.test(text)) return 'Confirme seu e-mail pelo link enviado antes de entrar.';
    return text;
  }
  async function profileFor(user) {
    const { data, error } = await client.from('profiles').select('id, full_name, role').eq('id', user.id).single();
    if (error) throw error;
    return data;
  }
  async function showStudent(user, profile) {
    document.body.classList.remove('bp-admin');
    document.body.classList.add('bp-student');
    document.getElementById('bp-student-welcome').textContent = 'Olá, ' + (profile.full_name || user.email) + '!';
    studentWorkouts.innerHTML = '<p>Buscando treinos vinculados à sua conta...</p>';
    const { data, error } = await client.from('workouts').select('id, title, focus, workout_days(day_of_week), workout_exercises(name, muscle_group, sets, reps, load)').eq('student_id', user.id).order('created_at', { ascending: false });
    if (error) {
      studentWorkouts.innerHTML = '<p>Não foi possível carregar os treinos. Confira a configuração do banco de dados.</p>';
      console.error(error);
      return;
    }
    if (!data || !data.length) {
      studentWorkouts.innerHTML = '<p>Você ainda não possui treinos vinculados. Quando a academia cadastrar seu plano, ele aparecerá aqui.</p>';
      return;
    }
    const days = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
    studentWorkouts.innerHTML = data.map(w => {
      const dayText = (w.workout_days || []).map(d => days[d.day_of_week]).filter(Boolean).join(' · ') || 'Dias não definidos';
      const exercises = (w.workout_exercises || []).map(e => `<li>${escapeHtml(e.name)} — ${escapeHtml(String(e.sets))} séries × ${escapeHtml(String(e.reps))}${e.muscle_group ? ' · ' + escapeHtml(e.muscle_group) : ''}${e.load ? ' · ' + escapeHtml(e.load) + ' kg' : ''}</li>`).join('');
      return `<article class="bp-workout"><h3>${escapeHtml(w.title)}</h3><p>${escapeHtml(w.focus || 'Treino')}</p><p class="bp-days">${escapeHtml(dayText)}</p>${exercises ? '<ul>' + exercises + '</ul>' : '<p>Exercícios ainda não cadastrados.</p>'}</article>`;
    }).join('');
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  async function routeUser(user) {
    const profile = await profileFor(user);
    if (profile.role === 'admin') {
      document.body.classList.remove('bp-student');
      document.body.classList.add('bp-admin');
      if (location.hash === '#login') location.hash = '#alunos';
    } else {
      await showStudent(user, profile);
    }
  }
  async function signUp() {
    setMode('signup');
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!name || !email || password.length < 8) {
      message('Preencha seu nome, e-mail e uma senha com pelo menos 8 caracteres.');
      return;
    }
    busy(true);
    try {
      const { data, error } = await client.auth.signUp({ email, password, options: { data: { full_name: name } } });
      if (error) throw error;
      if (data.session) {
        await routeUser(data.user);
      } else {
        message('Conta criada! Confira sua caixa de entrada e confirme o e-mail para liberar o acesso.');
        setMode('login');
      }
    } catch (error) { message(explainError(error)); }
    finally { busy(false); }
  }
  async function signIn(event) {
    event.preventDefault();
    setMode('login');
    busy(true);
    try {
      const { data, error } = await client.auth.signInWithPassword({ email: emailInput.value.trim(), password: passwordInput.value });
      if (error) throw error;
      await routeUser(data.user);
    } catch (error) { message(explainError(error)); }
    finally { busy(false); }
  }
  async function signOut() {
    await client.auth.signOut();
    document.body.classList.remove('bp-admin', 'bp-student');
    authBox.hidden = false;
    setMode('login');
  }
  function start() {
    if (!window.supabase || !configReady()) {
      message('Falta configurar o Supabase. Abra supabase-config.js e informe a URL e a chave anon/public do seu projeto. Depois execute o SQL do arquivo supabase-schema.sql no SQL Editor do Supabase.');
      return;
    }
    client = window.supabase.createClient(window.BP_SUPABASE_URL, window.BP_SUPABASE_ANON_KEY);
    signupBtn.addEventListener('click', signUp);
    loginBtn.addEventListener('click', () => setMode('login'));
    authForm.addEventListener('submit', signIn);
    document.getElementById('bp-logout-student').addEventListener('click', signOut);
    client.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        document.body.classList.remove('bp-admin', 'bp-student');
        authBox.hidden = false;
      } else {
        authBox.hidden = true;
        // Evita chamadas de rede dentro do callback síncrono do Supabase Auth.
        setTimeout(() => routeUser(session.user).catch(error => {
          console.error(error);
          message('Não foi possível carregar seu perfil. Confira se o SQL do Supabase foi executado.');
          authBox.hidden = false;
          document.body.classList.remove('bp-admin', 'bp-student');
        }), 0);
      }
    });
    client.auth.getSession().then(({ data }) => {
      if (!data.session) { authBox.hidden = false; setMode('login'); }
    });
  }
  start();
})();
