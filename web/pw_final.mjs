import { chromium } from "playwright";
const BASE = "https://earningsdesk-dev.pkhai.workers.dev";
const OUT = "C:\\Users\\pop\\AppData\\Local\\Temp\\claude\\C--Users-pop-Documents-Dev\\6fcab979-ec30-4dbd-a119-d5100d2c22e8\\scratchpad";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("404")) errors.push(`console: ${m.text()}`);
});

async function dismiss() {
  const ack = page.getByRole("button", { name: "Acknowledge and continue" });
  if (await ack.isVisible().catch(() => false)) await ack.click();
  const ck = page.getByRole("button", { name: "Accept all" });
  if (await ck.isVisible().catch(() => false)) await ck.click();
  await page.waitForTimeout(200);
}

await page.goto(`${BASE}/t/NVDA/`, { waitUntil: "load", timeout: 45000 });
await dismiss();

// 1. Options tab -> Structure card
await page.getByRole("tab", { name: "Options" }).click().catch(async () => {
  await page.getByText("Options", { exact: true }).first().click();
});
await page.waitForTimeout(800);
const structureVisible = await page.getByText("Structure", { exact: true }).isVisible().catch(() => false);
console.log("Structure card visible:", structureVisible);
const bodyText = await page.locator("body").innerText();
const strategyMatch = bodyText.match(/(Iron condor|Bull put spread|Bear call spread|Long straddle|Call debit spread|Put debit spread|Call calendar|Put calendar)/);
console.log("Strategy suggested:", strategyMatch ? strategyMatch[0] : "NONE FOUND");
await page.screenshot({ path: `${OUT}\\final1_structure.png`, fullPage: true });

// 2. Financials tab -> fundamentals grid + analyst ratings
await page.getByText("Financials", { exact: true }).first().click();
await page.waitForTimeout(2500);
console.log("Key figures visible:", await page.getByText("Key figures", { exact: true }).isVisible().catch(() => false));
console.log("Analyst actions visible:", await page.getByText("Analyst actions", { exact: true }).isVisible().catch(() => false));
await page.screenshot({ path: `${OUT}\\final2_financials.png`, fullPage: true });

// 3. Price tab -> click an earnings badge
await page.getByText("Price", { exact: true }).first().click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: "1Y", exact: true }).click();
await page.waitForTimeout(800);
const badge = page.locator('g[role="button"][aria-label*="Earnings"]').first();
const badgeCount = await page.locator('g[role="button"][aria-label*="Earnings"]').count();
console.log("clickable earnings badges:", badgeCount);
if (badgeCount > 0) {
  console.log("badge aria-label:", await badge.getAttribute("aria-label"));
  await badge.click({ force: true });
  await page.waitForTimeout(400);
  const txt = await page.locator("body").innerText();
  console.log("pinned tooltip shows EARNINGS label:", txt.includes("EARNINGS"));
  await page.screenshot({ path: `${OUT}\\final3_badge_clicked.png`, fullPage: true });
}

console.log("ERRORS:", JSON.stringify(errors, null, 2));
await browser.close();
