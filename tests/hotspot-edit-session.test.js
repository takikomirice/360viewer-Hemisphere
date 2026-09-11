const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const expired = '編集権限が確認できません。通常の編集画面を開き直してください。';
function client(respond, options = {}) {
  const calls = [];
  const context = { Promise, Error, editToken: 'expired', canEdit: true,
    editTokenRefreshPromise: null, google: { script: {
      url: { getLocation(callback) { callback({ parameter: { mode: 'edit', editKey: 'current-key' } }); } }
    } } };
  // GAS runners return a new configurable runner; model the callback chain, not the application.
  Object.defineProperty(context.google.script, 'run', { get() {
    let success, failure;
    const proxy = new Proxy({}, { get(target, method) {
      if (method === 'withSuccessHandler') return callback => { success = callback; return proxy; };
      if (method === 'withFailureHandler') return callback => { failure = callback; return proxy; };
      return (...args) => {
        calls.push({ method, args });
        Promise.resolve().then(() => respond(method, args, calls)).then(success, failure);
      };
    } });
    return proxy;
  } });
  Object.assign(context, options);
  const source = fs.readFileSync(require.resolve('../app.html'), 'utf8');
  const start = source.indexOf('function withEditToken(');
  const end = source.indexOf('function normalizeDeliveryMode(', start);
  vm.runInNewContext(source.slice(start, end), context);
  return { context, calls };
}

test('expired attachment saves renew once and preserve the complete payload and update ID', async () => {
  for (const method of ['saveHotspot', 'updateHotspot', 'getAudioVendorBundle']) {
    const { context, calls } = client((name, args) => {
      if (name === 'refreshEditToken') return { editToken: 'renewed' };
      if (args[0].__editToken === 'expired') throw new Error(expired);
      return { success: true };
    });
    const payload = { label: 'draft', photoUpload: { base64: 'photo' }, audioUpload: { base64: 'audio' } };
    const result = await context.runHotspotEditRequest(method, payload, ['spot-id']);
    assert.equal(result.success, true);
    assert.deepEqual(calls.map(call => call.method), [method, 'refreshEditToken', method]);
    assert.equal(calls[2].args[0].photoUpload, payload.photoUpload);
    assert.equal(calls[2].args[0].audioUpload, payload.audioUpload);
    assert.equal(calls[2].args[1], 'spot-id');
    assert.equal(payload.__editToken, undefined);
  }
});

test('ambiguous network failures and server-side save failures are never replayed', async () => {
  const failed = client(() => { throw new Error('network failed'); });
  await assert.rejects(failed.context.runHotspotEditRequest('saveHotspot', {}), /network failed/);
  assert.equal(failed.calls.length, 1);
  const returned = client(() => ({ success: false, error: expired }));
  assert.equal((await returned.context.runHotspotEditRequest('saveHotspot', {})).success, false);
  assert.equal(returned.calls.length, 1);
});

test('missing edit URL context cannot renew and failed renewal does not remain locked', async () => {
  const { context, calls } = client(() => { throw { message: expired }; });
  context.google.script.url.getLocation = callback => callback({ parameter: { mode: 'public', editKey: 'current-key' } });
  await assert.rejects(context.runHotspotEditRequest('saveHotspot', {}), /編集権限/);
  assert.equal(calls.length, 1);
  assert.equal(context.editTokenRefreshPromise, null);
  context.canEdit = false;
  await assert.rejects(context.runHotspotEditRequest('getAudioVendorBundle', {}), error => error.message === expired);
  assert.equal(calls.length, 2);
});

test('revoked keys and a second token rejection stop retrying', async () => {
  for (const refreshFails of [true, false]) {
    const { context, calls } = client(name => {
      if (name === 'refreshEditToken' && !refreshFails) return { editToken: 'renewed' };
      throw new Error(expired);
    });
    await assert.rejects(context.runHotspotEditRequest('saveHotspot', {}), /編集/);
    assert.equal(calls.length, refreshFails ? 2 : 3);
  }
});

test('concurrent failures share renewal and a closed form cannot be saved by a late retry', async () => {
  let active = true;
  const { context, calls } = client((name, args) => {
    if (name === 'refreshEditToken') { active = false; return { editToken: 'renewed' }; }
    if (args[0].__editToken === 'expired') throw new Error(expired);
    return { success: true };
  });
  const results = await Promise.allSettled([
    context.runHotspotEditRequest('saveHotspot', {}, [], () => active),
    context.runHotspotEditRequest('getAudioVendorBundle', {})
  ]);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(calls.filter(call => call.method === 'refreshEditToken').length, 1);
  assert.equal(calls.filter(call => call.method === 'saveHotspot').length, 1);
});
