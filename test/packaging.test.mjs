import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

test('CLI build produces a runnable bin and npm pack includes dist output', () => {
  execFileSync('npm', ['run', 'build:cli'], {
    cwd: repoRoot,
    stdio: 'pipe'
  });

  const binPath = join(repoRoot, 'dist/cli/oauthtriage.js');
  assert.equal(existsSync(binPath), true, 'expected compiled CLI bin');

  const tmpDir = mkdtempSync(join(tmpdir(), 'oauthtriage-packaging-'));
  const sampleOut = join(tmpDir, 'sample.csv');

  try {
    execFileSync('node', [binPath, 'sample', '--out', sampleOut], {
      cwd: repoRoot,
      stdio: 'pipe'
    });

    assert.equal(existsSync(sampleOut), true, 'expected sample CSV output');
    assert.match(readFileSync(sampleOut, 'utf8'), /^risk_level,/m);

    const packJson = execFileSync('npm', ['pack', '--json', '--dry-run', '--ignore-scripts'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe'
    });

    const packResult = JSON.parse(packJson);
    const files = packResult[0]?.files?.map((file) => file.path) || [];

    assert.equal(files.includes('dist/cli/oauthtriage.js'), true, 'expected compiled CLI in npm package');
    assert.equal(files.includes('src/app/page.tsx'), false, 'did not expect Next app source in npm package');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
