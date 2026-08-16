/**
 * Disclaimer body copy, shared between the first-visit modal (DisclaimerGate)
 * and the permanent /disclaimer page — one place, so the two can't drift
 * apart. Plain strings rather than JSX: the modal and the page each want
 * their own wrapper markup, and neither needs the apostrophe-escaping this
 * skips by just not using curly quotes here.
 */
export const DISCLAIMER_PARAGRAPHS: string[] = [
  "EarningsDesk is an informational and educational tool. Nothing on this site (the implied-move verdict, the directional read, the AI summary, or anything else) is financial advice or a recommendation to buy or sell any security.",
  "Every number here is a model output over public options flow, price history, and sentiment data. Models are wrong often enough that you should verify independently and never rely on a single number to size a real trade. Past performance, including this site's own scored track record, does not predict future results.",
  "Options trading carries substantial risk and isn't suitable for every investor. You are solely responsible for your own trading decisions.",
];
