import { readerIndex } from "../../lib/agent-reader.mjs";

export const prerender = true;
export const GET = () => new Response(JSON.stringify(readerIndex,null,2)+"\n", { headers: { "Content-Type": "application/json; charset=utf-8" } });
