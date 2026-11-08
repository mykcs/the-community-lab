// GitHub Pages is the only actively published site. The Vercel snapshot is
// retained solely for an explicitly requested rollback build.
export function selectedDeployTarget(env = process.env) {
  const target = env.COMMUNITY_DEPLOY_TARGET ?? 'github-pages';
  if (target !== 'github-pages' && target !== 'vercel') {
    throw new Error('Unsupported COMMUNITY_DEPLOY_TARGET (expected github-pages or vercel)');
  }
  return target;
}
