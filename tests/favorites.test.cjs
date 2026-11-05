const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const script = fs.readFileSync('index.html', 'utf8').match(/<script id="recipes-script">([\s\S]*?)<\/script>/)[1];
const settled = () => new Promise(resolve => setImmediate(resolve));

function setup() {
  const nodes = new Map();
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {
      children: [], textContent: '', attrs: {}, events: {}, open: false, value: '',
      classList: { add() {}, toggle() {} }, focus() {},
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; this.textContent = ''; },
      add(child) { this.append(child); },
      setAttribute(key, value) { this.attrs[key] = value; },
      addEventListener(event, callback) { this.events[event] = callback; }
    });
    return nodes.get(selector);
  }
  const calls = [];
  const db = {
    handler: async query => ({ data: query.op === 'insert' ? { recipe_id: query.payload.recipe_id } : [], error: null }),
    from(table) {
      const query = { table, filters: [], op: 'read',
        select() { return this; }, order() { return this; }, limit() { return this; }, single() { return this; },
        eq(column, value) { this.filters.push([column, value]); return this; },
        insert(payload) { this.op = 'insert'; this.payload = payload; return this; },
        delete() { this.op = 'delete'; return this; },
        then(resolve, reject) { calls.push(this); return Promise.resolve(db.handler(this)).then(resolve, reject); }
      };
      return query;
    }
  };
  const context = vm.createContext({
    document: { querySelector: node, createElement: tag => node(Symbol(tag)), createTextNode: text => text, createDocumentFragment: () => node(Symbol('fragment')), body: { classList: { add() {}, toggle() {} } } },
    Option: function() {}, Date, URL, console, fetch: () => new Promise(() => {})
  });
  vm.runInContext(script, context);
  context.db = db;
  vm.runInContext("favoritesClient = db; data.recipes = [{id:33,name:'테스트 메뉴',main_ingredients:[],months:[11]}]; activeRecipe = data.recipes[0];", context);
  return { node, db, calls, context, run: code => vm.runInContext(code, context) };
}

test('anonymous star prompts login without database writes', async () => {
  const env = setup(); await env.run('toggleFavorite()');
  assert.equal(env.node('#favorite-feedback').textContent, '로그인하면 즐겨찾기를 저장할 수 있어요');
  assert.equal(env.calls.length, 0);
});
test('saved IDs load only for current user and update star', async () => {
  const env = setup();
  env.db.handler = async () => ({ data: [{ recipe_id: 33 }], error: null });
  env.run("favoritesAuthChanged({id:'user-a'})"); await settled();
  assert.equal(env.node('#favorite-star').textContent, '★');
  assert.deepEqual(env.calls[0].filters, [['user_id', 'user-a']]);
});
test('save then remove persists using both account and recipe IDs', async () => {
  const env = setup(); env.run("favoritesAuthChanged({id:'user-a'})"); await settled();
  await env.run('toggleFavorite()');
  assert.equal(env.node('#favorite-star').textContent, '★');
  assert.equal(env.calls[1].payload.user_id, 'user-a');
  assert.equal(env.calls[1].payload.recipe_id, 33);
  await env.run('toggleFavorite()');
  assert.equal(env.node('#favorite-star').textContent, '☆');
  assert.deepEqual(env.calls[2].filters, [['user_id', 'user-a'], ['recipe_id', 33]]);
});
test('failed save never displays a saved star', async () => {
  const env = setup(); env.run("favoritesAuthChanged({id:'user-a'})"); await settled();
  env.db.handler = async () => ({ data: null, error: { code: '42501' } });
  await env.run('toggleFavorite()');
  assert.equal(env.node('#favorite-star').textContent, '☆');
  assert.match(env.node('#favorite-feedback').textContent, /변경하지 못/);
});
test('duplicate save is treated as already saved', async () => {
  const env = setup(); env.run("favoritesAuthChanged({id:'user-a'})"); await settled();
  env.db.handler = async () => ({ data: null, error: { code: '23505' } });
  await env.run('toggleFavorite()');
  assert.equal(env.node('#favorite-star').textContent, '★');
});
test('double clicks cannot issue duplicate writes', async () => {
  const env = setup(); env.run("favoritesAuthChanged({id:'user-a'})"); await settled();
  let complete;
  env.db.handler = query => new Promise(resolve => { complete = () => resolve({ data: { recipe_id: query.payload.recipe_id }, error: null }); });
  const pending = env.run('toggleFavorite()'); await settled();
  await env.run('toggleFavorite()');
  assert.equal(env.calls.length, 2);
  assert.equal(env.node('#favorite-star').disabled, true);
  complete(); await pending;
  assert.equal(env.node('#favorite-star').textContent, '★');
});
test('logout discards in-flight load from previous user', async () => {
  const env = setup(); let complete;
  env.db.handler = () => new Promise(resolve => { complete = resolve; });
  env.run("favoritesAuthChanged({id:'user-a'})"); await settled();
  env.run('favoritesAuthChanged(null)');
  complete({ data: [{ recipe_id: 33 }], error: null }); await settled();
  assert.equal(env.run('favoriteIds.size'), 0);
  assert.equal(env.node('#favorite-star').textContent, '☆');
});
test('logout discards in-flight save from previous user', async () => {
  const env = setup(); env.run("favoritesAuthChanged({id:'user-a'})"); await settled();
  let complete;
  env.db.handler = () => new Promise(resolve => { complete = resolve; });
  const pending = env.run('toggleFavorite()'); await settled();
  env.run('favoritesAuthChanged(null)');
  complete({ data: { recipe_id: 33 }, error: null }); await pending;
  assert.equal(env.run('favoriteIds.size'), 0);
});
test('favorites view renders saved recipe cards without month filter', async () => {
  const env = setup();
  env.db.handler = async () => ({ data: [{ recipe_id: 33 }], error: null });
  env.run("favoritesAuthChanged({id:'user-a'})"); await settled();
  env.run("monthSelect.value = '1'; setFavoritesView(true)");
  assert.equal(env.node('#favorites-count').textContent, '저장한 레시피 1개');
  assert.equal(env.node('#favorites-grid').children[0].children.length, 1);
  env.run('favoritesAuthChanged(null)');
  assert.equal(env.node('#favorites-grid').children.length, 0);
  assert.equal(env.node('#favorites-message').textContent, '로그인하면 즐겨찾기를 저장할 수 있어요');
});
