import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Hard cap on total demo runs (resets on cold start, but combined with rate
// limiting this is solid protection for a friends-and-family demo).
// Override via DEMO_MAX_CALLS env var in Vercel if you want to adjust.
const DEMO_MAX_CALLS = Number(process.env.DEMO_MAX_CALLS ?? 500);
let totalCalls = 0;

// Simple in-process rate limit: max 10 requests per IP per minute
const requestLog = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const window = 60 * 1000;
  const max = 10;
  const timestamps = (requestLog.get(ip) ?? []).filter(t => now - t < window);
  if (timestamps.length >= max) return true;
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return false;
}

const mockFlights = [
  { airline: 'LX / AC', stops: 1, durationMinutes: 735, layoverMinutes: 120, priceAmount: 690, currency: 'EUR', departure: '10:25', arrival: '18:40', layoverAirport: 'LHR' },
  { airline: 'BA',      stops: 1, durationMinutes: 820, layoverMinutes: 260, priceAmount: 620, currency: 'EUR', departure: '07:10', arrival: '20:50', layoverAirport: 'LHR' },
  { airline: 'LH',      stops: 1, durationMinutes: 765, layoverMinutes:  95, priceAmount: 735, currency: 'EUR', departure: '13:30', arrival: '22:15', layoverAirport: 'FRA' },
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for'] ?? 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  if (totalCalls >= DEMO_MAX_CALLS) {
    return res.status(503).json({ error: 'Demo quota reached for today. Check back soon!' });
  }
  totalCalls += 1;

  const { origin = 'ZRH', destination = 'YYZ', departureDate, adults = 1, cabin = 'ECONOMY', maxStops = 2, preferences = 'Best value' } = req.body;

  const flights = mockFlights.filter(f => f.stops <= Number(maxStops));

  const flightList = flights.map((f, i) =>
    `Flight ${i + 1}: ${f.airline} | ${origin}-${destination} | Dep ${f.departure} Arr ${f.arrival} | ` +
    `${Math.floor(f.durationMinutes / 60)}h ${f.durationMinutes % 60}m | ` +
    `${f.stops} stop (${f.layoverMinutes}min layover at ${f.layoverAirport}) | ` +
    `${f.priceAmount} ${f.currency} | ${cabin}`
  ).join('\n');

  const prompt = `You are a flight advisor agent for Colleague AI — a demo for friends and prospects to experience how AI agents reason about choices.

Search: ${origin} → ${destination} | Date: ${departureDate ?? 'flexible'} | ${adults} passenger(s) | ${cabin}
Preferences: ${preferences}

Available flights:
${flightList}

Return ONLY a JSON array (no markdown, no text outside the array):
[
  {
    "airline": "string",
    "route": "${origin}-${destination}",
    "departure": "HH:MM",
    "arrival": "HH:MM",
    "stops": number,
    "duration": "Xh Ym",
    "price": "amount currency",
    "score": number 0-100,
    "reason": "1-2 sentences explaining the recommendation given the traveller's preferences"
  }
]

Score 0-100 based on price, duration, layover comfort, and match to preferences. Sort best first.`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
    let results;
    try {
      results = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      results = match ? JSON.parse(match[0]) : [];
    }

    return res.status(200).json({ results });
  } catch (err) {
    console.error('Anthropic API error:', err);
    return res.status(500).json({ error: 'Agent error. Please try again.' });
  }
}
