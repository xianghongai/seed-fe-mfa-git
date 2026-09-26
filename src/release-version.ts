/**
 * MFA release versions, following "微前端 6 - 命名规范与仓库规划":
 *
 *   <release> ::= ["v"] <major> "." <minor> "." <patch>
 *                 [ "." <patch-type> <patch-number> ]           ; HP, CP or SP, project versions only
 *                 [ "-" <maturity> "." <iteration> ]            ; alpha, beta or rc; none means released
 *                 [ "." "C" <customer> [ "-U" <delivery> ] ]    ; customer edition and its delivery
 *
 * The customer edition comes last, like a Docker image variant, so every version is also a valid image tag.
 * `+` is never allowed: Docker image tags reject it.
 *
 * Only the maturity moves here (next iteration, next stage). Patch and customer segments are planned by the
 * project and kept as written, and a released version needs a new release plan instead of a computed one.
 */

export type ReleaseStage = 'beta' | 'rc' | 'release';
export type Maturity = 'alpha' | 'beta' | 'rc';
export type PatchType = 'HP' | 'CP' | 'SP';

export interface ReleaseVersion {
  /** `v` when written with the Tag prefix. */
  prefix: '' | 'v';
  major: number;
  minor: number;
  patch: number;
  /** Hot patch, cold patch or service pack, e.g. `SP1`. */
  patchLevel?: { type: PatchType; number: number };
  /** Absent for a released version. */
  maturity?: { stage: Maturity; iteration: number };
  /** Customer edition, e.g. `CICBC-U2`: code `ICBC` and delivery 2. */
  customer?: { code: string; delivery?: number };
}

export interface ReleaseCandidates {
  /** The next iteration of the same maturity, e.g. 1.1.0-alpha.83 → 1.1.0-alpha.84. */
  iterate: string;
  /** The next maturity stage, starting at iteration 1; after rc comes the release itself. */
  advance: { stage: ReleaseStage; version: string };
}

/**
 * `versionInvalid`: not an MFA release version; `plusNotAllowed`: uses `+`, which Docker image tags reject
 * (customer editions are written `.C<customer>`); `released`: already released, a new version needs a new plan.
 */
export type ReleaseVersionIssue = 'versionInvalid' | 'plusNotAllowed' | 'released';

export type ReleaseCandidatesResult =
  | { ok: true; candidates: ReleaseCandidates }
  | { ok: false; reason: ReleaseVersionIssue };

const pattern =
  /^(v)?(\d+)\.(\d+)\.(\d+)(?:\.(HP|CP|SP)(\d+))?(?:-(alpha|beta|rc)\.(\d+))?(?:\.C([A-Z0-9]+)(?:-U(\d+))?)?$/u;

export const parseReleaseVersion = (version: string): ReleaseVersion | undefined => {
  const match = pattern.exec(version);
  if (!match) {
    return undefined;
  }
  const [, prefix, major, minor, patch, patchType, patchNumber, stage, iteration, customer, delivery] = match;
  return {
    prefix: prefix ? 'v' : '',
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    ...(patchType ? { patchLevel: { type: patchType as PatchType, number: Number(patchNumber) } } : {}),
    ...(stage ? { maturity: { stage: stage as Maturity, iteration: Number(iteration) } } : {}),
    ...(customer ? { customer: { code: customer, ...(delivery ? { delivery: Number(delivery) } : {}) } } : {}),
  };
};

/** The same version without its maturity, i.e. its released form. */
const withoutMaturity = ({ maturity: _maturity, ...version }: ReleaseVersion): ReleaseVersion => version;

export const formatReleaseVersion = (version: ReleaseVersion): string =>
  [
    `${version.prefix}${version.major}.${version.minor}.${version.patch}`,
    version.patchLevel ? `.${version.patchLevel.type}${version.patchLevel.number}` : '',
    version.maturity ? `-${version.maturity.stage}.${version.maturity.iteration}` : '',
    version.customer ? `.C${version.customer.code}` : '',
    version.customer?.delivery !== undefined ? `-U${version.customer.delivery}` : '',
  ].join('');

/**
 * The product line a version belongs to: base version, patch level and customer edition, without the maturity
 * or the `v` prefix. Only versions of the same line are compared, so a standard release never stands in for a
 * customer edition, nor one customer for another.
 */
export const releaseLine = (version: ReleaseVersion): string =>
  formatReleaseVersion({ ...withoutMaturity(version), prefix: '' });

const maturityRank: Record<Maturity, number> = { alpha: 0, beta: 1, rc: 2 };
// A released version comes after every prerelease of the same line.
const rank = (version: ReleaseVersion) => (version.maturity ? maturityRank[version.maturity.stage] : 3);

/**
 * Orders two versions of the same line by maturity and iteration; versions of different lines are ordered by
 * their line so that sorting stays stable. Returns a negative number, zero or a positive number.
 */
export const compareReleaseVersions = (left: ReleaseVersion, right: ReleaseVersion): number => {
  const leftLine = releaseLine(left);
  const rightLine = releaseLine(right);
  if (leftLine !== rightLine) {
    return leftLine < rightLine ? -1 : 1;
  }
  return rank(left) - rank(right) || (left.maturity?.iteration ?? 0) - (right.maturity?.iteration ?? 0);
};

const nextStage: Record<Maturity, ReleaseStage> = { alpha: 'beta', beta: 'rc', rc: 'release' };

export const releaseCandidates = (version: string): ReleaseCandidatesResult => {
  if (version.includes('+')) {
    return { ok: false, reason: 'plusNotAllowed' };
  }
  const parsed = parseReleaseVersion(version);
  if (!parsed) {
    return { ok: false, reason: 'versionInvalid' };
  }
  const { maturity } = parsed;
  if (!maturity) {
    return { ok: false, reason: 'released' };
  }
  const stage = nextStage[maturity.stage];
  const next: ReleaseVersion =
    stage === 'release' ? withoutMaturity(parsed) : { ...parsed, maturity: { stage, iteration: 1 } };
  return {
    ok: true,
    candidates: {
      iterate: formatReleaseVersion({ ...parsed, maturity: { ...maturity, iteration: maturity.iteration + 1 } }),
      advance: { stage, version: formatReleaseVersion(next) },
    },
  };
};
