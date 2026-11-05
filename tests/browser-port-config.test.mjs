import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function configWith(port) {
  const env = { ...process.env };
  delete env.COMMUNITY_BROWSER_PORT;
  if (port !== null) env.COMMUNITY_BROWSER_PORT = port;
  const run = spawnSync(process.execPath, [
    '--input-type=module', '-e',
    "import config from './playwright.config.mjs'; console.log(JSON.stringify({baseURL:config.use.baseURL,url:config.webServer.url,command:config.webServer.command}));",
  ], { cwd: new URL('..', import.meta.url), env, encoding: 'utf8' });
  return run;
}

test('isolated local QA port changes both preview command and tested URL while CI default stays unchanged', () => {
  const normal = configWith(null);
  assert.equal(normal.status, 0, normal.stderr);
  const defaultConfig = JSON.parse(normal.stdout);
  assert.equal(defaultConfig.baseURL, 'http://127.0.0.1:4321/the-community-lab/');
  assert.match(defaultConfig.command, /--port 4321/);

  const isolated = configWith('4391');
  assert.equal(isolated.status, 0, isolated.stderr);
  const chosen = JSON.parse(isolated.stdout);
  assert.equal(chosen.baseURL, 'http://127.0.0.1:4391/the-community-lab/');
  assert.equal(chosen.url, chosen.baseURL + 'questionnaire/');
  assert.match(chosen.command, /--port 4391/);
});

test('invalid QA listener values cannot reach shell invocation', () => {
  for (const value of ['bad', '4391;echo-injection', '0', '99999', '4391junk']) {
    const run = configWith(value);
    assert.notEqual(run.status, 0, value);
    assert.match(run.stderr, /COMMUNITY_BROWSER_PORT/, value);
  }
});
