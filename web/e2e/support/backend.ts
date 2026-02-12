import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestInfo } from '@playwright/test';

import { getFreePort } from './ports';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, '../../..');
const SNAPSHOT_PATH = path.resolve(REPO_ROOT, 'web/e2e/snapshots/base.sqlite3');

const STARTUP_TIMEOUT_MS = 30_000;
const POLL_DELAY_MS = 200;

export interface IsolatedBackend {
  baseUrl: string;
  stop: () => Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectLogs(processHandle: ChildProcessWithoutNullStreams): {
  lines: string[];
  dispose: () => void;
} {
  const lines: string[] = [];

  const onStdout = (data: Buffer) => {
    lines.push(`[stdout] ${data.toString().trimEnd()}`);
  };
  const onStderr = (data: Buffer) => {
    lines.push(`[stderr] ${data.toString().trimEnd()}`);
  };

  processHandle.stdout.on('data', onStdout);
  processHandle.stderr.on('data', onStderr);

  return {
    lines,
    dispose: () => {
      processHandle.stdout.off('data', onStdout);
      processHandle.stderr.off('data', onStderr);
    },
  };
}

async function waitForBackendReady(
  baseUrl: string,
  processHandle: ChildProcessWithoutNullStreams,
  logs: string[],
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < STARTUP_TIMEOUT_MS) {
    if (processHandle.exitCode !== null) {
      throw new Error(
        `backend exited before becoming healthy (exit code ${processHandle.exitCode})\n${logs.join('\n')}`,
      );
    }

    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Expected until backend comes up.
    }

    await sleep(POLL_DELAY_MS);
  }

  throw new Error(`backend did not become healthy within ${STARTUP_TIMEOUT_MS}ms\n${logs.join('\n')}`);
}

async function stopProcess(processHandle: ChildProcessWithoutNullStreams): Promise<void> {
  if (processHandle.exitCode !== null) {
    return;
  }

  processHandle.kill('SIGTERM');

  const exited = await Promise.race([
    new Promise<boolean>((resolve) => {
      processHandle.once('exit', () => resolve(true));
    }),
    sleep(5_000).then(() => false),
  ]);

  if (!exited && processHandle.exitCode === null) {
    processHandle.kill('SIGKILL');
    await new Promise<void>((resolve) => {
      processHandle.once('exit', () => resolve());
    });
  }
}

export async function startIsolatedBackend(testInfo: TestInfo): Promise<IsolatedBackend> {
  try {
    await access(SNAPSHOT_PATH, fsConstants.R_OK);
  } catch {
    throw new Error(
      `missing E2E snapshot at ${SNAPSHOT_PATH}. Run 'make e2e-snapshot' first.`,
    );
  }

  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'tourney-e2e-'));
  const dbPath = path.join(runtimeDir, 'test.sqlite3');
  await copyFile(SNAPSHOT_PATH, dbPath);

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const backend = spawn(
    'uv',
    ['run', 'uvicorn', 'api.main:app', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        USE_MOCK_DATA: 'true',
        TOURNEY_DB_PATH: dbPath,
        PYTHONUNBUFFERED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const logCollector = collectLogs(backend);

  try {
    await waitForBackendReady(baseUrl, backend, logCollector.lines);
  } catch (error) {
    logCollector.dispose();
    await stopProcess(backend);
    await rm(runtimeDir, { recursive: true, force: true });
    throw error;
  }

  let stopped = false;
  const stop = async () => {
    if (stopped) {
      return;
    }
    stopped = true;
    logCollector.dispose();
    await stopProcess(backend);
    await rm(runtimeDir, { recursive: true, force: true });
  };

  void testInfo.attach('isolated-backend', {
    body: Buffer.from(
      JSON.stringify(
        {
          baseUrl,
          dbPath,
          snapshotPath: SNAPSHOT_PATH,
        },
        null,
        2,
      ),
    ),
    contentType: 'application/json',
  });

  return { baseUrl, stop };
}
