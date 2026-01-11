import { spawn as spawnProcess } from 'child_process';

interface IDisposable {
  dispose(): void;
}

const createDisposable = (cleanup: () => void): IDisposable => ({
  dispose: cleanup,
});

export function spawn(
  file: string,
  args: string[] | string,
  options: { cwd?: string; env?: Record<string, string | undefined>; cols?: number; rows?: number }
) {
  const argv = Array.isArray(args) ? args : [args];
  const child = spawnProcess(file, argv, {
    cwd: options.cwd,
    env: options.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const onData = (listener: (chunk: string) => void) => {
    const handler = (chunk: Buffer) => listener(chunk.toString());
    child.stdout?.on('data', handler);
    child.stderr?.on('data', handler);
    return createDisposable(() => {
      child.stdout?.off('data', handler);
      child.stderr?.off('data', handler);
    });
  };

  const onExit = (listener: (data: { exitCode: number }) => void) => {
    const handler = (code: number | null) => listener({ exitCode: code ?? 0 });
    child.on('exit', handler);
    return createDisposable(() => {
      child.off('exit', handler);
    });
  };

  return {
    pid: child.pid ?? 0,
    cols: options.cols ?? 80,
    rows: options.rows ?? 24,
    process: file,
    handleFlowControl: false,
    onData,
    onExit,
    write: (data: string) => {
      child.stdin?.write(data);
    },
    resize: () => {},
    clear: () => {},
    kill: (signal?: NodeJS.Signals | number) => child.kill(signal),
    pause: () => undefined,
    resume: () => undefined,
  };
}
