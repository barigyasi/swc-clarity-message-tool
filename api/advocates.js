// Per-state Stand With Crypto advocate counts, parsed from the SWC homepage's
// server-rendered advocates-map payload. Cached at the edge for a day.
// Snapshot fallback captured 2026-07-26 in case the page structure changes.
const SNAPSHOT = {
  AK: 6062, AL: 30352, AR: 17756, AS: 28, AZ: 64933, CA: 378962, CO: 51113,
  CT: 29835, DC: 6504, DE: 7143, FL: 245834, GA: 91957, GU: 879, HI: 3814,
  IA: 14868, ID: 13260, IL: 93038, IN: 40830, KS: 16719, KY: 24158, LA: 29602,
  MA: 52532, MD: 47408, ME: 7445, MI: 63900, MN: 33911, MO: 35645, MS: 15508,
  MT: 7156, NC: 73447, ND: 4945, NE: 9991, NH: 9702, NJ: 94521, NM: 12133,
  NV: 40234, NY: 222038, OH: 74075, OK: 24741, OR: 34320, PA: 85034, PR: 13961,
  RI: 8104, SC: 35103, SD: 4941, TN: 46297, TX: 241131, UT: 28767, VA: 66135,
  VI: 330, VT: 2973, WA: 68294, WI: 31351, WV: 8124, WY: 3458,
};

module.exports = async (request, response) => {
  let counts = { ...SNAPSHOT };
  let source = 'snapshot';
  try {
    const r = await fetch('https://www.standwithcrypto.org', {
      headers: { 'user-agent': 'swc-clarity-message-tool/1.0' },
    });
    if (r.ok) {
      const html = await r.text();
      const pairs = [...html.matchAll(/state\\":\\"([A-Z]{2})\\",\\"totalAdvocates\\":([0-9]+)/g)];
      if (pairs.length >= 50) {
        for (const [, st, n] of pairs) counts[st] = parseInt(n, 10);
        source = 'live';
      }
    }
  } catch (e) { /* fall through to snapshot */ }

  response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  response.status(200).json({ source, counts });
};
