const test = require('node:test');
const assert = require('node:assert/strict');
const { createCompatibleIndex } = require('../indexCompatibility');

function collection(existing, thrownError = null) {
  let calls = 0;
  const indexes = [...existing];
  return {
    get calls() { return calls; },
    indexes: async () => indexes,
    createIndex: async (key, options) => {
      calls += 1;
      if (thrownError) throw thrownError;
      const name = options.name || Object.entries(key).map(([k,v]) => `${k}_${v}`).join('_');
      indexes.push({ key, ...options, name });
      return name;
    },
  };
}

test('existing unique sparse username index is reused without createIndex', async () => {
  const users = collection([{key: {username:1}, name:'username_1', unique:true, sparse:true, background:true}]);
  assert.equal(await createCompatibleIndex(users, {username:1}, {unique:true}, 'users'), 'username_1');
  assert.equal(users.calls, 0);
});

test('fresh usernames obtain unique index', async () => {
  const users = collection([{key:{_id:1},name:'_id_',unique:true}]);
  assert.equal(await createCompatibleIndex(users, {username:1}, {unique:true}, 'users'), 'username_1');
  assert.equal(users.calls, 1);
});

test('existing nonunique username index cannot silently bypass uniqueness', async () => {
  const users = collection([{key:{username:1},name:'username_1'}]);
  await assert.rejects(createCompatibleIndex(users, {username:1}, {unique:true}, 'users'), /not unique/);
  assert.equal(users.calls, 0);
});

test('same-name different-key index is not destroyed', async () => {
  const users = collection([{key:{old_username:1},name:'username_1'}]);
  await assert.rejects(createCompatibleIndex(users, {username:1}, {unique:true}, 'users'), /different keys/);
  assert.equal(users.calls, 0);
});

test('other existing indexes with option differences are reused', async () => {
  const deliveries = collection([{key:{branch_id:1,work_date:-1},name:'branch_id_1_work_date_-1',background:true}]);
  await createCompatibleIndex(deliveries,{branch_id:1,work_date:-1},{},'deliveries');
  assert.equal(deliveries.calls,0);
});
