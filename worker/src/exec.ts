import { execFile } from "node:child_process";

export class CommandError extends Error {
  constructor(
    readonly command: string,
    readonly stderr: string,
  ) {
    super(`${command} failed: ${stderr.trim().split("\n").slice(-3).join(" ")}`);
  }
}

/** Runs a command without a shell and resolves with its stdout. */
export function run(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { cwd: options.cwd, timeout: options.timeoutMs ?? 10 * 60_000, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) reject(new CommandError(command, stderr || error.message));
        else resolve(stdout);
      },
    );
  });
}
