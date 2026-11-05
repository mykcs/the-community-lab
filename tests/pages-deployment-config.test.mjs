import test from 'node:test';
import assert from 'node:assert/strict';
import { getPagesDeploymentConfig } from '../lib/pages-deployment-config.mjs';

test('Pages defaults to the existing GitHub project-site origin and base path', () => {
  assert.deepEqual(getPagesDeploymentConfig({}), {
    site: 'https://mykcs.github.io',
    base: '/the-community-lab/',
    publicUrl: 'https://mykcs.github.io/the-community-lab',
    customDomain: null,
  });
});

test('a configured custom domain uses the site root while preserving one canonical URL', () => {
  assert.deepEqual(getPagesDeploymentConfig({ COMMUNITY_PAGES_DOMAIN: 'Quiz.Example.test' }), {
    site: 'https://quiz.example.test',
    base: '/',
    publicUrl: 'https://quiz.example.test',
    customDomain: 'quiz.example.test',
  });
});

test('custom Pages domains reject URLs, paths, ports, and shared github.io origins', () => {
  for (const value of [
    'https://quiz.example.test',
    'quiz.example.test/path',
    'quiz.example.test?next=other',
    'quiz.example.test:8443',
    'mykcs.github.io',
    'another-owner.github.io',
    'localhost',
  ]) {
    assert.throws(() => getPagesDeploymentConfig({ COMMUNITY_PAGES_DOMAIN: value }), TypeError, value);
  }
});
