import { expect, test } from "@playwright/test";

test("public Agent Reader exposes only directory context and works at this viewport", async ({ page, request }) => {
  const res=await page.goto("agent/");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading",{level:1})).toContainText("Agent");
  await expect(page.getByRole("link", {name:"THE COMMUNITY LAB. 同频实验室首页"})).toBeVisible();
  await expect(page.getByRole("button",{name:"复制站点上下文"})).toBeVisible();
  await page.locator("details summary").click();
  const content=await page.locator("#community-context-text").inputValue();
  expect(content).toContain("非官方");
  expect(content).toContain("UNKNOWN");
  expect(content).toContain("the-community-lab");
  expect(content).not.toContain("github_pat_");
  const indexRes=await request.get("agent/site.json");
  expect(indexRes.ok()).toBeTruthy();
  const index=await indexRes.json();
  expect(index.schema).toBe("the-community-lab/agent-reader/v1");
  expect(index.seasons).toHaveLength(2);
  expect(content).toContain(String(index.seasons[0].observedQuestionCount));
  expect(index.verification.officialScoringParity).toContain("UNKNOWN");

  await page.getByRole("button",{name:"复制站点上下文"}).click();
  await expect(page.locator("#copy-community-status")).toContainText(/已复制|手动复制/);

  expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)).toBe(false);
  const skill=await request.get("agent/SKILL.md");
  expect(skill.status()).toBe(200);
  expect(await skill.text()).toContain("name: the-community-lab-reader");
  const llms=await request.get("llms.txt");
  expect(llms.status()).toBe(200);
  expect(await llms.text()).toContain("/the-community-lab/agent/SKILL.md");
});
