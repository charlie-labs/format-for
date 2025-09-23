/* eslint-disable no-process-env */
import { describe, expect, test } from 'vitest';

import { createEnvDefaultsProvider, createFormatFor } from '../../index.js';

function hasEnv(key: string): boolean {
  return typeof process.env[key] === 'string' && process.env[key]!.length > 0;
}

/**
 * Integration tests that hit real external APIs when read-only tokens are present.
 *
 * - SLACK_BOT_TOKEN: exercises Slack catalog loading (users/channels)
 * - LINEAR_API_KEY: exercises Linear users + autolinks against live data
 *
 * These tests are skipped automatically when the corresponding env var is missing.
 */

describe('integration: env defaults provider (conditional)', () => {
  test.runIf(hasEnv('SLACK_BOT_TOKEN'))(
    'Slack: loads users/channels snapshot via API',
    async () => {
      const provider = createEnvDefaultsProvider();
      await provider.ensureFor('slack');
      const snap = provider.snapshot();
      // Sanity: at least one of users/channels should be non-empty in a real workspace
      const usersCount = Object.keys(snap.maps?.slack?.users ?? {}).length;
      const chansCount = Object.keys(snap.maps?.slack?.channels ?? {}).length;
      expect(usersCount + chansCount).toBeGreaterThan(0);
      // Formatting should still succeed regardless of catalog contents
      const ff = createFormatFor({ defaults: provider });
      const out = await ff.slack('hello world');
      expect(typeof out).toBe('string');
    }
  );

  test.runIf(hasEnv('LINEAR_API_KEY'))(
    'Linear: @user links to profile; autolinks apply when rules exist',
    async () => {
      const provider = createEnvDefaultsProvider();
      await provider.ensureFor('linear');
      const snap = provider.snapshot();

      const ff = createFormatFor({ defaults: provider });

      // @user → link to profile using live users map (pick first entry if any)
      const linUsers = Object.entries(snap.maps?.linear?.users ?? {});
      if (linUsers.length > 0) {
        const [handle, info] = linUsers[0]!;
        const res = await ff.github(`hi @${handle}`);
        const label = info.label ?? `@${handle}`;
        expect(res).toContain(`[${label}](${info.url})`);
      } else {
        // No users fetched; still ensure formatting works
        const res = await ff.github('hi @someone');
        expect(typeof res).toBe('string');
      }

      // Issue autolinks: Build a sample from the first rule's regex, if present
      const rules = snap.autolinks?.linear ?? [];
      if (rules.length > 0) {
        const rule = rules[0]!;
        const src = rule.pattern.source;
        // Attempt to extract the first KEY from a group like (ENG|BOT|...)
        let firstKey: string | undefined;
        const open = src.indexOf('(');
        const close = open >= 0 ? src.indexOf(')', open + 1) : -1;
        if (open >= 0 && close > open) {
          const group = src.slice(open + 1, close);
          firstKey = group.split('|')[0];
        }
        if (firstKey) {
          const sample = `${firstKey}-123`;
          const mm = new RegExp(rule.pattern.source, rule.pattern.flags).exec(
            sample
          );
          if (mm) {
            const expectedUrl = rule.urlTemplate
              .replace(/\$(\d+)/g, (_, g1) => mm[Number(g1)] ?? '')
              .replace(/\$0/g, mm[0]!);
            const res = await ff.github(`See ${sample}`);
            expect(res).toContain(`[${sample}](${expectedUrl})`);
          }
        }
      }
    }
  );
});
