import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeAccountError, NEW_PASSWORD_REQUIREMENTS, validateAccountPassword } from '../src/account-validation.js';

test('signup requires eight characters and an ASCII uppercase letter without requiring digits or symbols', () => {
  for (const password of ['Abcdefgh', 'ABCDEFGH', 'A       ']) assert.equal(validateAccountPassword(password, { signup: true }), '');
  for (const password of ['Abcdefg', 'abcdefgh', '12345678', 'àbcdefgh', '       ']) {
    assert.equal(validateAccountPassword(password, { signup: true }), NEW_PASSWORD_REQUIREMENTS);
  }
});

test('password validation preserves meaningful spaces and enforces the supported maximum', () => {
  assert.equal(validateAccountPassword(' Abcdef ', { signup: true }), '');
  assert.equal(validateAccountPassword('A'.repeat(4096), { signup: true }), '');
  assert.match(validateAccountPassword('A'.repeat(4097), { signup: true }), /4096/u);
  assert.equal(validateAccountPassword('', { signup: true }), 'Inserisci la password.');
  assert.equal(validateAccountPassword(null, { signup: true }), 'Inserisci la password.');
});

test('login does not reject existing passwords locally because they predate the new signup policy', () => {
  for (const password of ['old', 'lowercase', '   ']) assert.equal(validateAccountPassword(password), '');
  assert.equal(validateAccountPassword(''), 'Inserisci la password.');
});

test('duplicate registrations receive an explicit message while invalid credentials remain generic', () => {
  assert.equal(describeAccountError({ code: 'auth/email-already-in-use' }, 'signup'), 'Esiste già un account con questa email. Accedi oppure recupera la password.');
  const invalid = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'];
  for (const code of invalid) assert.equal(describeAccountError({ code }, 'login'), 'Email o password non corrette. Controlla i dati e riprova.');
});

test('server password policy failures describe the rules and give existing users a recovery route', () => {
  for (const code of ['auth/weak-password', 'auth/password-does-not-meet-requirements']) {
    assert.equal(describeAccountError({ code }, 'signup'), NEW_PASSWORD_REQUIREMENTS);
    assert.match(describeAccountError({ code }, 'login'), /Hai dimenticato la password/u);
    assert.match(describeAccountError({ code }, 'login'), /8 caratteri e una lettera maiuscola/u);
  }
  assert.match(describeAccountError({ code: 'auth/account-exists-with-different-credential' }), /altro metodo di accesso/u);
  assert.match(describeAccountError({ code: 'auth/too-many-requests' }), /Attendi/u);
});
