/// <reference types="node" />

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatChatDay, formatChatTime, looksLikeContact, mergeMessages, sameChatDay } from './chat-rules.ts';

test('looksLikeContact matches what the database hides', () => {
  assert.equal(looksLikeContact('Call me on 077 123 4567'), true);
  assert.equal(looksLikeContact('+94771234567'), true);
  assert.equal(looksLikeContact('077-123-4567'), true);
  assert.equal(looksLikeContact('wa.me/94771234567'), true);
  assert.equal(looksLikeContact('https://fb.com/x'), true);
  assert.equal(looksLikeContact('kasun.p@gmail.com'), true);
  assert.equal(looksLikeContact('Rs 12,000 a day, pickup 8.30 on 2026-10-12'), false);
  assert.equal(looksLikeContact('Is it free for 5 days?'), false);
});

test('chat times in Sri Lanka time', () => {
  const now = new Date('2026-10-14T06:00:00Z'); // 11:30 Wed 14 Oct in Colombo
  assert.equal(formatChatTime('2026-10-14T03:15:00Z', now), '08:45');
  assert.equal(formatChatTime('2026-10-13T10:00:00Z', now), 'Yesterday');
  assert.equal(formatChatTime('2026-10-10T10:00:00Z', now), 'Sat');
  assert.equal(formatChatTime('2026-09-30T10:00:00Z', now), '30 Sep');
  // 23:00 UTC on the 13th is already the 14th in Colombo.
  assert.equal(formatChatTime('2026-10-13T23:00:00Z', now), '04:30');
});

test('day separators', () => {
  const now = new Date('2026-10-14T06:00:00Z');
  assert.equal(formatChatDay('2026-10-14T03:15:00Z', now), 'Today');
  assert.equal(formatChatDay('2026-10-13T10:00:00Z', now), 'Yesterday');
  assert.equal(formatChatDay('2026-10-10T10:00:00Z', now), 'Sat 10 Oct');
  assert.equal(sameChatDay('2026-10-13T20:00:00Z', '2026-10-14T01:00:00Z'), true);
  assert.equal(sameChatDay('2026-10-13T10:00:00Z', '2026-10-14T01:00:00Z'), false);
});

test('mergeMessages keeps newest first without duplicates', () => {
  const merged = mergeMessages([{ id: 3 }, { id: 1 }], [{ id: 2 }, { id: 3 }, { id: 4 }]);
  assert.deepEqual(merged.map((m) => m.id), [4, 3, 2, 1]);
});
