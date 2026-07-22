import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/cli.js';

function argv(...args: string[]): string[] {
  return ['node', 'yuque', ...args];
}

describe('runCli', () => {
  it('returns 0 for --help', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await expect(runCli(argv('--help'))).resolves.toBe(0);
    } finally {
      write.mockRestore();
    }
  });

  it('returns 0 for --version', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await expect(runCli(argv('--version'))).resolves.toBe(0);
    } finally {
      write.mockRestore();
    }
  });

  it('returns 2 for an unknown command', async () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await expect(runCli(argv('definitely-not-a-command'))).resolves.toBe(2);
    } finally {
      write.mockRestore();
    }
  });

  it('returns 2 when invoked with no arguments', async () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await expect(runCli(argv())).resolves.toBe(2);
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
  });
});
