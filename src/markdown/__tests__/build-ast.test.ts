import { beforeEach, describe, expect, test, vi } from 'vitest';

// We'll mock the runtime defaults module so we can deterministically control
// the snapshot used by the AST builder without touching env/fetch.
// Note: build-ast.ts imports "../runtime/defaults.js" (from src/markdown/*),
// and from this test file (src/markdown/__tests__/*) the same file resolves to
// "../../runtime/defaults.js".

type AutoLinkRule = {
  pattern: RegExp;
  urlTemplate: string;
  labelTemplate?: string;
};

type MentionMaps = {
  slack?: {
    users?: Record<string, { id: string; label?: string }>;
    channels?: Record<string, { id: string; label?: string }>;
  };
  linear?: { users?: Record<string, { url: string; label?: string }> };
};

type Snapshot = { maps?: MentionMaps; autolinks?: { linear?: AutoLinkRule[] } };

let snapshot: Snapshot = {};

vi.mock('../../runtime/defaults.js', () => {
  return {
    // Only the function used by build-ast.ts; keep the shape minimal.
    ensureDefaultsForTarget: vi.fn(async () => snapshot),
  };
});

// Utility to import the module under test after mocks are in place.
async function loadBuilders() {
  const mod = await import('../build-ast.js');
  return {
    buildAstForGithub: mod.buildAstForGithub,
    buildAstForSlack: mod.buildAstForSlack,
    buildAstForLinear: mod.buildAstForLinear,
  } as const;
}

// Minimal recursive finder to collect nodes by type from mdast Roots
function collect(node: any, type: string, out: any[] = []): any[] {
  if (!node || typeof node !== 'object') return out;
  if (node.type === type) out.push(node);
  const kids: any[] = Array.isArray(node.children) ? node.children : [];
  for (const c of kids) collect(c, type, out);
  return out;
}

describe('build-ast: target-aware maps + autolinks merge', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    snapshot = {};
  });

  test('uses Slack maps on Slack and Linear maps on GitHub/Linear; caller maps override defaults', async () => {
    snapshot = {
      maps: {
        slack: { users: { riley: { id: 'U_DEF', label: 'Riley S' } } },
        linear: {
          users: {
            riley: {
              url: 'https://linear.app/acme/profiles/riley',
              label: 'Riley L',
            },
          },
        },
      },
    };

    const { buildAstForSlack, buildAstForGithub, buildAstForLinear } =
      await loadBuilders();

    // Slack: @riley -> mention using caller override (not default)
    const slackAst = await buildAstForSlack('Hello @riley', {
      maps: { slack: { users: { riley: { id: 'U_CALL', label: 'R' } } } },
    });
    const mentions = collect(slackAst, 'mention');
    expect(mentions.length).toBe(1);
    expect(mentions[0]?.data?.subtype).toBe('user');
    expect(mentions[0]?.data?.id).toBe('U_CALL'); // caller overrides defaults

    // GitHub: @riley -> link using Linear map (never Slack mention)
    const ghAst = await buildAstForGithub('Hello @riley');
    const ghLinks = collect(ghAst, 'link');
    expect(ghLinks.length).toBeGreaterThan(0);
    expect(ghLinks[0]?.url).toContain('https://linear.app/acme/profiles/riley');

    // Linear: same as GitHub behavior
    const linAst = await buildAstForLinear('Hello @riley');
    const linLinks = collect(linAst, 'link');
    expect(linLinks.length).toBeGreaterThan(0);
    expect(linLinks[0]?.url).toContain(
      'https://linear.app/acme/profiles/riley'
    );
  });

  test('deep-merges autolinks by family (append instead of overwrite)', async () => {
    snapshot = {
      autolinks: {
        linear: [
          {
            pattern: /BOT-(\d+)/g,
            urlTemplate: 'https://linear.app/acme/issue/$0',
          },
        ],
      },
    };

    const { buildAstForGithub } = await loadBuilders();

    const ast = await buildAstForGithub('See BOT-1 and ENG-2', {
      autolinks: {
        linear: [
          {
            pattern: /ENG-(\d+)/g,
            urlTemplate: 'https://linear.app/acme/issue/$0',
          },
        ],
      },
    });

    const links = collect(ast, 'link');
    const urls = links.map((n) => String(n?.url ?? ''));
    expect(urls).toContain('https://linear.app/acme/issue/BOT-1');
    expect(urls).toContain('https://linear.app/acme/issue/ENG-2');
  });

  test('no defaults and no options leaves text untouched', async () => {
    snapshot = {}; // nothing from runtime
    const { buildAstForSlack, buildAstForGithub } = await loadBuilders();

    const slackAst = await buildAstForSlack('Hello @riley and BOT-123');
    expect(collect(slackAst, 'mention').length).toBe(0);
    expect(collect(slackAst, 'link').length).toBe(0);

    const ghAst = await buildAstForGithub('Hello @riley and BOT-123');
    expect(collect(ghAst, 'mention').length).toBe(0);
    expect(collect(ghAst, 'link').length).toBe(0);
  });
});
