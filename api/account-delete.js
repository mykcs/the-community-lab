// Optional rollback adapter for Vercel Functions. GitHub Pages is static and
// uses the Supabase Edge Function instead; both share one tested deletion core.
import { createAccountDeleteHandler } from '../supabase/functions/_shared/account-delete.mjs';

export { createAccountDeleteHandler };
export default { fetch: request => createAccountDeleteHandler()(request) };
