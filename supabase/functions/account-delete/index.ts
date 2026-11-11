import { createAccountDeleteEdgeHandler } from '../_shared/account-delete-edge.mjs';

// Astro's Node-oriented type check also includes this Deno-only entrypoint.
// Keep the small platform declaration local instead of widening the website's
// global TypeScript libraries or bundling server code into the static site.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

// No project, Auth, keys or user data are provisioned by this candidate.
// Production activation requires a private Supabase project and real tests.
const keys = [
  'PUBLIC_HISTORY_AUTH_ENABLED', 'PUBLIC_HISTORY_SITE_ORIGIN', 'HISTORY_ACCOUNT_DELETE_ENABLED',
  'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_SECRET_KEYS',
];
const env = Object.fromEntries(keys.map(name => [name, Deno.env.get(name)]));

Deno.serve(createAccountDeleteEdgeHandler({ env }));
