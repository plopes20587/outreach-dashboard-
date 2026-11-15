// Companies Pat wants to work at, with the domain staff actually use for email.
// The tiers mirror TARGET COMPANIES in profile.js, so edit both when one changes.
//
// The domain is what Hunter searches, and a wrong one silently returns nothing,
// so it is the staff email domain, not always the product's website. Hunter has
// no way to tell "wrong domain" from "no designers here". Check a new entry with
//   curl "https://api.hunter.io/v2/email-count?domain=<domain>"
// before trusting it: that endpoint is free and needs no key.
export const TARGET_TIERS = [
  {
    tier: "Stretch",
    companies: [
      { name: "Google",   domain: "google.com" },
      { name: "Netflix",  domain: "netflix.com" },
      { name: "Spotify",  domain: "spotify.com" },
      { name: "Coinbase", domain: "coinbase.com" },
      { name: "Blizzard", domain: "blizzard.com" },
    ],
  },
  {
    tier: "Strong fit",
    companies: [
      { name: "Ramp",      domain: "ramp.com" },
      { name: "Fitbod",    domain: "fitbod.me" },
      { name: "Popeyes",   domain: "rbi.com" },  // parent company; popeyes.com is franchise ops only
      { name: "Meta",      domain: "meta.com" },
      { name: "Amazon",    domain: "amazon.com" },
      { name: "Anthropic", domain: "anthropic.com" },
      { name: "Figma",     domain: "figma.com" },
    ],
  },
  {
    tier: "Sandbox",
    companies: [
      { name: "Stitch Fix", domain: "stitchfix.com" },
      { name: "Hopper",     domain: "hopper.com" },
      { name: "Uplight",    domain: "uplight.com" },
      { name: "Toast",      domain: "toasttab.com" },
      { name: "Nextdoor",   domain: "nextdoor.com" },
    ],
  },
];

export function findTarget(name) {
  return TARGET_TIERS.flatMap((t) => t.companies).find((c) => c.name === name) || null;
}
