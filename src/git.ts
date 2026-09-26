/**
 * Runs git through simple-git in a directory, with the developer's own environment and Git configuration.
 */
import { existsSync } from 'node:fs';
import { simpleGit, type SimpleGit } from 'simple-git';

export interface GitOptions {
  /** Directory the commands run in. */
  cwd: string;
  /** Extra environment variables, e.g. an outbound proxy; merged over `process.env`. */
  env?: Record<string, string | undefined> | undefined;
  signal?: AbortSignal | undefined;
  /** Called with each command line before it runs, e.g. `git fetch --tags -- origin`. */
  onCommand?: ((command: string) => void) | undefined;
  /** Called with stdout and stderr chunks as they arrive. */
  onOutput?: ((text: string) => void) | undefined;
}

export interface Git {
  /** Runs a command and returns its trimmed stdout; rejects when git exits with an error. */
  run(args: string[]): Promise<string>;
  /** Runs a command for probing: any failure other than cancellation resolves to `undefined`. */
  probe(args: string[]): Promise<string | undefined>;
}

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) {
    throw signal.reason ?? new Error('Aborted');
  }
};

export const createGit = (options: GitOptions): Git => {
  // simple-git replaces the environment instead of merging it; never prompt for credentials interactively.
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', ...options.env };
  const client: SimpleGit = simpleGit({
    baseDir: options.cwd,
    trimmed: true,
    ...(options.signal ? { abort: options.signal } : {}),
    // Commands and their arguments are fixed by this package; the environment and configuration are the
    // developer's own (SSH command, askpass, credential helper, proxy, even an ordinary PAGER or GIT_EDITOR).
    // simple-git rejects them by default, and its environment guard would throw on the ones passed on and
    // silently drop the inherited ones, so the whole environment handed to git is allowed.
    allowEnvironment: Object.keys(env),
    unsafe: {
      allowUnsafeAskPass: true,
      allowUnsafeConfigEnvCount: true,
      allowUnsafeConfigPaths: true,
      allowUnsafeCredentialHelper: true,
      allowUnsafeEditor: true,
      allowUnsafeGitProxy: true,
      allowUnsafePager: true,
      allowUnsafeSshCommand: true,
    },
  })
    .env(env)
    .outputHandler((_command, stdout, stderr, args) => {
      options.onCommand?.(['git', ...args].join(' '));
      if (options.onOutput) {
        stdout.on('data', (chunk: Buffer) => options.onOutput?.(chunk.toString()));
        stderr.on('data', (chunk: Buffer) => options.onOutput?.(chunk.toString()));
      }
    });
  const run = (args: string[]) => client.raw(args);
  return {
    run,
    probe: async (args) => {
      try {
        return await run(args);
      } catch {
        throwIfAborted(options.signal);
        return undefined;
      }
    },
  };
};

/** simple-git requires an existing base directory; a missing one simply has no repository. */
export const directoryExists = (directory: string): boolean => existsSync(directory);
