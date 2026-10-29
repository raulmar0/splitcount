import test from 'node:test';
import assert from 'node:assert/strict';
import { invitationHref, newInvitees } from '../src/invitations.js';

const link = 'https://splitcount.raulmar.com/#grupo=private.token';
const invitation = { groupName: 'Cena & amigos', memberName: 'María', link };

test('WhatsApp receives an international number and the complete encoded invitation', () => {
  const url = new URL(invitationHref('whatsapp', '+52 (81) 1234-5678', invitation));
  assert.equal(url.origin, 'https://wa.me');
  assert.equal(url.pathname, '/528112345678');
  assert.match(url.searchParams.get('text'), /María/);
  assert.match(url.searchParams.get('text'), /Cena & amigos/);
  assert.ok(url.searchParams.get('text').includes(link));
});

test('SMS uses a validated international recipient and an encoded message', () => {
  const href = invitationHref('sms', '+52 81 1234 5678', invitation);
  assert.ok(href.startsWith('sms:+528112345678?body='));
  assert.ok(decodeURIComponent(href.split('?body=')[1]).includes(link));
});

test('email contains only the validated recipient, subject and body', () => {
  const href = invitationHref('email', ' maria+viajes@example.com ', invitation);
  const url = new URL(href);
  assert.equal(url.protocol, 'mailto:');
  assert.equal(decodeURIComponent(url.pathname), 'maria+viajes@example.com');
  assert.equal(url.searchParams.get('subject'), 'Te invito a Cena & amigos en Splitcount');
  assert.ok(url.searchParams.get('body').includes(link));
});

test('invalid contacts and header injection never create an invitation link', () => {
  for (const channel of ['whatsapp', 'sms']) {
    for (const contact of ['', '8112345678', '+52abc8112345678', '+12', '+01234567890', '+1234567890123456']) {
      assert.equal(invitationHref(channel, contact, invitation), null, `${channel}: ${contact}`);
    }
  }
  for (const contact of ['', 'maria', 'maria@example', 'a@example.com\r\nBcc:hacker@example.com', 'a@example.com?bcc=other@example.com']) {
    assert.equal(invitationHref('email', contact, invitation), null, contact);
  }
  assert.equal(invitationHref('unknown', '+528112345678', invitation), null);
});

test('only newly added people are offered an invitation, excluding the current person', () => {
  const original = [{ id: 'you', name: 'Tú' }, { id: 'ana', name: 'Ana' }];
  const next = [...original, { id: 'bea', name: 'Bea' }, { id: 'car', name: 'Carla' }];
  assert.deepEqual(newInvitees(next, original), ['bea', 'car']);
  assert.deepEqual(newInvitees(original), ['ana']);
  assert.deepEqual(newInvitees(next, [], 'bea'), ['you', 'ana', 'car']);
});
