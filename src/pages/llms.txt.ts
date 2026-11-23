import { llmsText } from "../lib/agent-reader.mjs";

export const prerender = true;
export const GET = () => new Response(llmsText(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
