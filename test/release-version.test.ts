/**
 * Release versions: application and project release versions, maturity
 * stages, patch levels (HP/CP/SP), customer editions (C<customer>-U<delivery>) and the Docker tag constraint.
 */
import { describe, expect, it } from 'vitest';
import {
  compareReleaseVersions,
  formatReleaseVersion,
  parseReleaseVersion,
  releaseCandidates,
  releaseLine,
  type ReleaseVersion,
} from '../src/index.js';

// Docker image tag: word characters, dots and dashes, at most 128, not starting with a dot or a dash.
const dockerTag = /^[\w][\w.-]{0,127}$/u;

const parse = (version: string): ReleaseVersion => {
  const parsed = parseReleaseVersion(version);
  if (!parsed) {
    throw new Error(`Expected ${version} to be a release version`);
  }
  return parsed;
};

describe('release version syntax', () => {
  it.each([
    // Application release versions (container.release.version, microapps[].release.version).
    ['1.8.0', { major: 1, minor: 8, patch: 0 }],
    ['1.7.1-alpha.3', { maturity: { stage: 'alpha', iteration: 3 } }],
    ['1.7.1-beta.2', { maturity: { stage: 'beta', iteration: 2 } }],
    ['1.8.0-rc.1', { maturity: { stage: 'rc', iteration: 1 } }],
    // Tags carry the `v` prefix and equal release.version.
    ['v1.7.1', { prefix: 'v', major: 1, minor: 7, patch: 1 }],
    ['v1.2.1-rc.1', { prefix: 'v', maturity: { stage: 'rc', iteration: 1 } }],
    // Project baselines and releases with a hot patch, cold patch or service pack.
    ['2.6.0.HP1', { patchLevel: { type: 'HP', number: 1 } }],
    ['2.6.0.CP2', { patchLevel: { type: 'CP', number: 2 } }],
    ['2.6.0.SP1', { patchLevel: { type: 'SP', number: 1 } }],
    ['2.6.0.SP1-rc.1', { patchLevel: { type: 'SP', number: 1 }, maturity: { stage: 'rc', iteration: 1 } }],
    // Customer editions: C + customer code, optionally the delivery batch U<n>.
    ['2.6.0.CICBC', { customer: { code: 'ICBC' } }],
    ['2.6.0.CICBC-U2', { customer: { code: 'ICBC', delivery: 2 } }],
    [
      '1.7.1-alpha.3.CPUMCH-U1',
      { maturity: { stage: 'alpha', iteration: 3 }, customer: { code: 'PUMCH', delivery: 1 } },
    ],
    [
      'v2.6.0.SP1-beta.2.CWCH-U3',
      {
        prefix: 'v',
        patchLevel: { type: 'SP', number: 1 },
        maturity: { stage: 'beta', iteration: 2 },
        customer: { code: 'WCH', delivery: 3 },
      },
    ],
  ])('reads %s', (version, expected) => {
    const parsed = parse(version);
    expect(parsed).toMatchObject(expected);
    expect(formatReleaseVersion(parsed)).toBe(version);
    expect(version).toMatch(dockerTag);
  });

  it.each([
    ['1.7.1+CICBC', 'build metadata with +, which Docker image tags reject'],
    ['2.6.0.CICBC-U2-alpha.1', 'maturity after the customer edition; the edition always comes last'],
    ['2.6.0-alpha.1.SP1', 'patch level after the maturity'],
    ['1.7.1-alpha', 'maturity without an iteration'],
    ['1.7.1-dev.1', 'maturity other than alpha, beta and rc'],
    ['1.7.1-ALPHA.1', 'maturity in upper case'],
    ['2.6.0.cicbc', 'customer code in lower case'],
    ['2.6.0.C', 'customer edition without a code'],
    ['2.6.0.CICBC-U', 'delivery batch without a number'],
    ['2.6.0.CICBC-2', 'delivery batch without U'],
    ['2.6.0.XP1', 'unknown patch type'],
    ['2.6.0.SP', 'patch type without a number'],
    ['2.6', 'missing patch number'],
    ['V2.6.0', 'upper-case V prefix'],
    ['release/2.6.0', 'a branch, not a version'],
    ['', 'empty'],
  ])('rejects %s: %s', (version) => {
    expect(parseReleaseVersion(version)).toBeUndefined();
  });
});

describe('next versions', () => {
  it.each([
    // Standard releases: alpha → beta → rc → release, a new stage starting at 1.
    ['1.1.0-alpha.83', '1.1.0-alpha.84', 'beta', '1.1.0-beta.1'],
    ['1.1.0-beta.2', '1.1.0-beta.3', 'rc', '1.1.0-rc.1'],
    ['1.1.0-rc.3', '1.1.0-rc.4', 'release', '1.1.0'],
    ['1.1.0-alpha.9', '1.1.0-alpha.10', 'beta', '1.1.0-beta.1'],
    // Tags keep their `v` prefix.
    ['v1.2.0-alpha.1', 'v1.2.0-alpha.2', 'beta', 'v1.2.0-beta.1'],
    ['v1.2.1-rc.1', 'v1.2.1-rc.2', 'release', 'v1.2.1'],
    // Patch levels are planned by the project and kept as written.
    ['2.6.0.SP1-alpha.1', '2.6.0.SP1-alpha.2', 'beta', '2.6.0.SP1-beta.1'],
    ['2.6.0.HP2-rc.1', '2.6.0.HP2-rc.2', 'release', '2.6.0.HP2'],
    // Customer editions and their delivery batch are kept; only the maturity moves.
    ['1.7.1-alpha.3.CICBC-U2', '1.7.1-alpha.4.CICBC-U2', 'beta', '1.7.1-beta.1.CICBC-U2'],
    ['1.7.1-beta.1.CICBC', '1.7.1-beta.2.CICBC', 'rc', '1.7.1-rc.1.CICBC'],
    ['2.6.0-rc.2.CICBC-U2', '2.6.0-rc.3.CICBC-U2', 'release', '2.6.0.CICBC-U2'],
    ['v2.6.0.SP1-rc.1.CPUMCH-U1', 'v2.6.0.SP1-rc.2.CPUMCH-U1', 'release', 'v2.6.0.SP1.CPUMCH-U1'],
  ])('%s iterates to %s and advances to %s %s', (version, iterate, stage, advanced) => {
    const result = releaseCandidates(version);
    expect(result).toEqual({ ok: true, candidates: { iterate, advance: { stage, version: advanced } } });
    expect(iterate).toMatch(dockerTag);
    expect(advanced).toMatch(dockerTag);
  });

  it.each(['1.8.0', 'v1.7.1', '2.6.0.SP1', '2.6.0.CICBC-U2', 'v2.6.0.SP1.CPUMCH-U1'])(
    'leaves the released %s to a new release plan, never inventing the next version',
    (version) => {
      expect(releaseCandidates(version)).toEqual({ ok: false, reason: 'released' });
    }
  );

  it('rejects + with its own reason, and any other invalid version', () => {
    expect(releaseCandidates('1.0.0-alpha.17+CICBC')).toEqual({ ok: false, reason: 'plusNotAllowed' });
    expect(releaseCandidates('2.6.0.CICBC-U2-alpha.1')).toEqual({ ok: false, reason: 'versionInvalid' });
    expect(releaseCandidates('1.0.0-0')).toEqual({ ok: false, reason: 'versionInvalid' });
  });
});

describe('product lines and ordering', () => {
  it('groups versions by base, patch level and customer edition, ignoring the maturity and the v prefix', () => {
    expect(releaseLine(parse('v1.7.1-alpha.3'))).toBe('1.7.1');
    expect(releaseLine(parse('1.7.1-rc.1.CICBC-U2'))).toBe('1.7.1.CICBC-U2');
    expect(releaseLine(parse('2.6.0.SP1-beta.2.CPUMCH'))).toBe('2.6.0.SP1.CPUMCH');
    // A standard release, another customer and another delivery batch are all different lines.
    const lines = ['1.7.1', '1.7.1.CICBC', '1.7.1.CICBC-U2', '1.7.1.CPUMCH-U2', '1.7.1.SP1'].map((version) =>
      releaseLine(parse(version))
    );
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('orders a line by maturity, then by iteration as a number, with the release last', () => {
    const versions = ['1.7.1', '1.7.1-rc.1', 'v1.7.1-alpha.10', '1.7.1-beta.1', '1.7.1-alpha.9', '1.7.1-alpha.2'].map(
      parse
    );
    expect(versions.sort(compareReleaseVersions).map(formatReleaseVersion)).toEqual([
      '1.7.1-alpha.2',
      '1.7.1-alpha.9',
      'v1.7.1-alpha.10',
      '1.7.1-beta.1',
      '1.7.1-rc.1',
      '1.7.1',
    ]);
    expect(compareReleaseVersions(parse('v1.7.1-rc.1'), parse('1.7.1-rc.1'))).toBe(0);
  });
});
