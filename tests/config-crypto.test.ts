import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
} from '../src/lib/crypto';

test('production refuses new plaintext secrets and keeps legacy values readable', async () => {
  const previousMode = process.env.NODE_ENV;
  const previousKey = process.env.CONFIG_ENCRYPTION_KEY;
  process.env.NODE_ENV = 'production';
  delete process.env.CONFIG_ENCRYPTION_KEY;
  try {
    await assert.rejects(
      encryptSecret('fixture value'),
      /CONFIG_ENCRYPTION_KEY/
    );
    assert.equal(
      await decryptSecret('legacy fixture value'),
      'legacy fixture value'
    );
    assert.equal(await encryptSecret(''), '');
    process.env.CONFIG_ENCRYPTION_KEY = 'isolated-fixture-encryption-key';
    const encrypted = await encryptSecret('fixture value');
    assert.equal(isEncryptedSecret(encrypted), true);
    assert.equal(await decryptSecret(encrypted), 'fixture value');
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
    if (previousKey === undefined) delete process.env.CONFIG_ENCRYPTION_KEY;
    else process.env.CONFIG_ENCRYPTION_KEY = previousKey;
  }
});
