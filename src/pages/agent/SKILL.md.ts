import { skill } from "../../lib/agent-reader.mjs";

export const prerender = true;
export const GET = () => new Response(skill, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
