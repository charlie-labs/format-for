/* eslint-disable no-process-env */
import { describe, expect, test } from 'vitest';

import { formatFor } from '../../index.js';
import {
  ensureDefaultsForTarget,
  resetRuntimeDefaultsForTests,
} from '../../runtime/defaults.js';

function hasEnv(key: string): boolean {
  return typeof process.env[key] === 'string' && process.env[key]!.length > 0;
}

/**
 * Integration tests that hit real external APIs when read-only tokens are present.
 *
 * - SLACK_BOT_TOKEN: exercises Slack user mention rendering (dynamic user picked from API)
 * - LINEAR_API_KEY: exercises Linear @user link rendering and issue autolinks
 *
 * These tests are skipped automatically when the corresponding env var is missing.
 */

describe('integration: external API-backed defaults (conditional)', () => {
  test.runIf(hasEnv('SLACK_BOT_TOKEN'))(
    'Slack: renders @user as <@U…> using live catalog',
    async () => {
      resetRuntimeDefaultsForTests();
      const snap = await ensureDefaultsForTarget('slack');
      const users = Object.entries(snap.maps?.slack?.users ?? {});
      // If the workspace is empty (unlikely), just assert we didn't throw and produced a string
      if (users.length === 0) {
        const out = await formatFor.slack('hello world');
        expect(typeof out).toBe('string');
        return;
      }
      const [handle, info] = users[0]!; // first available user handle/id
      const out = await formatFor.slack(`hi @${handle}`);
      // Expect the Slack renderer to emit a mention with that user's ID
      expect(out).toContain(`<@${info.id}>`);
    }
  );

  test.runIf(hasEnv('LINEAR_API_KEY'))(
    'Linear: renders @user as profile link; applies issue autolinks when rules exist',
    async () => {
      resetRuntimeDefaultsForTests();
      const snap = await ensureDefaultsForTarget('linear');

      // @user → link to profile using live users map (pick first entry if any)
      const linUsers = Object.entries(snap.maps?.linear?.users ?? {});
      if (linUsers.length > 0) {
        const [handle, info] = linUsers[0]!;
        const out = await formatFor.github(`hi @${handle}`);
        const label = info.label ?? `@${handle}`;
        expect(out).toContain(`[${label}](${info.url})`);
      } else {
        // No users fetched; still ensure formatting works
        const out = await formatFor.github('hi @someone');
        expect(typeof out).toBe('string');
      }

      // Issue autolinks: build a synthetic KEY-123 from the first rule's regex, if present
      const rules = snap.autolinks?.linear ?? [];
      if (rules.length > 0) {
        const rule = rules[0]!;
        // Parse the team key alternation from the regex source: \\b(KEY1|KEY2)-(\\d+)\\b
        const src = rule.pattern.source;
        // Extract the alternation inside the first pair of parentheses: (KEY1|KEY2|...)
        let firstKey: string | undefined;
        const open = src.indexOf('(');
        const close = open >= 0 ? src.indexOf(')', open + 1) : -1;
        if (open >= 0 && close > open) {
          const group = src.slice(open + 1, close);
          firstKey = group.split('|')[0];
        }
        if (firstKey) {
          const sample = `${firstKey}-123`;
          // Compute expected URL by applying the same $1/$2 substitution used by the canonicalizer
          const mm = new RegExp(rule.pattern.source).exec(sample);
          if (mm) {
            const expectedUrl = rule.urlTemplate
              .replace(/\$(\d+)/g, (_, g1) => mm[Number(g1)] ?? '')
              .replace(/\$0/g, mm[0]!);
            const out = await formatFor.github(`See ${sample}`);
            expect(out).toContain(`[${sample}](${expectedUrl})`);
          }
        }
      }
    }
  );
});
