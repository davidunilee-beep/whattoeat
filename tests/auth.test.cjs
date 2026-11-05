const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script id="auth-script">([\s\S]*?)<\/script>/)[1];

function setup({ configured = true, session = null, signupSession = null, loginError = null, signupError = null, signoutError = null, restoreError = null } = {}) {
  const nodes = new Map();
  let stateListener;
  const calls = [];
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {
      value: '', hidden: false, disabled: false, open: false, textContent: '', events: {},
      classList: { toggle() {}, add() {} }, setAttribute() {}, focus() {},
      addEventListener(event, callback) { this.events[event] = callback; },
      reportValidity() { return true; },
      showModal() { this.open = true; },
      close() { this.open = false; this.events.close?.(); }
    });
    return nodes.get(selector);
  }
  const user = { email: 'test@example.com' };
  const client = { auth: {
    onAuthStateChange(callback) { stateListener = callback; },
    async getSession() { return { data: { session }, error: restoreError }; },
    async signInWithPassword(credentials) { calls.push(['login', { ...credentials }]); return { data: { session: loginError ? null : { user } }, error: loginError }; },
    async signUp(credentials) { calls.push(['signup', { ...credentials }]); return { data: { session: signupSession }, error: signupError }; },
    async signOut(options) { calls.push(['logout', options]); return { error: signoutError }; }
  } };
  const context = vm.createContext({ document: { querySelector: node, body: { classList: { toggle() {}, add() {} } } }, window: { supabase: { createClient: () => client } } });
  const source = configured ? script.replace("const SUPABASE_URL = '';", "const SUPABASE_URL = 'https://test.supabase.co';").replace("const SUPABASE_PUBLISHABLE_KEY = '';", "const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';") : script;
  vm.runInContext(source, context);
  return { node, calls, emit: session => stateListener('SIGNED_IN', session), user };
}
const settled = () => new Promise(resolve => setImmediate(resolve));
async function submit(env, mode = 'login') {
  env.node('#login-button').events.click();
  if (mode === 'signup') env.node('#auth-switch').events.click();
  env.node('#auth-email').value = ' test@example.com ';
  env.node('#auth-password').value = 'Example123!';
  await env.node('#auth-form').events.submit({ preventDefault() {} });
}

test('configuration missing: login popup works but cannot submit', async () => {
  const env = setup({ configured: false });
  await settled();
  await submit(env);
  assert.equal(env.node('#auth-dialog').open, true);
  assert.equal(env.node('#auth-submit').disabled, true);
  assert.match(env.node('#auth-message').textContent, /준비 중/);
  assert.equal(env.calls.length, 0);
});
test('password login displays email, closes dialog, and logout restores login button', async () => {
  const env = setup(); await settled(); await submit(env);
  assert.equal(env.calls[0][1].email, 'test@example.com');
  assert.equal(env.node('#account-email').textContent, env.user.email);
  assert.equal(env.node('#login-button').hidden, true);
  assert.equal(env.node('#logout-button').hidden, false);
  assert.equal(env.node('#auth-dialog').open, false);
  assert.equal(env.node('#auth-password').value, '');
  await env.node('#logout-button').events.click();
  assert.equal(env.node('#login-button').hidden, false);
  assert.equal(env.node('#account-email').textContent, '');
});
test('signup awaiting email confirmation does not falsely log in', async () => {
  const env = setup(); await settled(); await submit(env, 'signup');
  assert.equal(env.calls[0][0], 'signup');
  assert.match(env.node('#auth-message').textContent, /인증 링크/);
  assert.equal(env.node('#auth-dialog').open, true);
  assert.equal(env.node('#login-button').hidden, false);
  assert.equal(env.node('#auth-password').value, '');
});
test('signup with a returned session logs in', async () => {
  const env = setup({ signupSession: { user: { email: 'new@example.com' } } });
  await settled(); await submit(env, 'signup');
  assert.equal(env.node('#account-email').textContent, 'new@example.com');
  assert.equal(env.node('#auth-dialog').open, false);
});
test('invalid login shows friendly error and allows retry', async () => {
  const env = setup({ loginError: { code: 'invalid_credentials' } });
  await settled(); await submit(env);
  assert.match(env.node('#auth-message').textContent, /이메일 또는 비밀번호/);
  assert.equal(env.node('#auth-submit').disabled, false);
  assert.equal(env.node('#auth-dialog').open, true);
});
test('session restoration and auth state updates refresh header', async () => {
  const env = setup({ session: { user: { email: 'restored@example.com' } } });
  await settled();
  assert.equal(env.node('#account-email').textContent, 'restored@example.com');
  env.emit(null);
  assert.equal(env.node('#login-button').hidden, false);
  assert.equal(env.node('#account-email').textContent, '');
});
test('logout failure preserves user and reports failure', async () => {
  const env = setup({ session: { user: { email: 'restored@example.com' } }, signoutError: new Error('network') });
  await settled(); await env.node('#logout-button').events.click();
  assert.equal(env.node('#account-email').textContent, 'restored@example.com');
  assert.equal(env.node('#account-notice').hidden, false);
  assert.equal(env.node('#logout-button').disabled, false);
});
test('restoration error prevents sending credentials and keeps recipes usable', async () => {
  const env = setup({ restoreError: new Error('network') });
  await settled();
  assert.equal(env.node('#login-button').disabled, false);
  await submit(env);
  assert.equal(env.calls.length, 0);
});
