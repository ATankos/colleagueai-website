import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DEMO_MAX_CALLS = Number(process.env.DEMO_MAX_CALLS ?? 500);
let totalCalls = 0;

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for'] ?? 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  if (totalCalls >= DEMO_MAX_CALLS) return res.status(503).json({ error: 'Demo quota reached for today. Check back soon!' });
  totalCalls += 1;

  const { origin = 'ZRH', destination = 'YYZ', departureDate, cabin = 'ECONOMY', preferences = 'Best value' } = req.body;

  const flightList = mockFlights.map((f, i) =>
    `Flight ${i + 1}: ${f.airline} | ${origin}-${destination} | Dep ${f.departure} Arr ${f.arrival} | ` +
    `${Math.floor(f.durationMinutes / 60)}h ${f.durationMinutes % 60}m | ` +
    `${f.stops} stop (${f.layoverMinutes}min layover at ${f.layoverAirport}) | ` +
    `${f.priceAmount} ${f.currency} | ${cabin}`
  ).join('\n');

  const prompt = `You are a senior flight advisor agent at Colleague AI — an enterprise AI platform that helps companies make smarter procurement decisions. You are demonstrating your capabilities to potential customers.

Search: ${origin} → ${destination} | Date: ${departureDate ?? 'flexible'} | ${cabin}
Traveller preferences: ${preferences}

Available flights:
${flightList}

Analyse each flight carefully against the traveller's preferences. Consider: total cost, journey duration, layover comfort, connection risk, and overall value. Think like an expert corporate travel manager.

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
    "verdict": "RECOMMENDED" | "ALTERNATIVE" | "AVOID",
    "reason": "2-3 sentences explaining the recommendation with specific reference to the traveller's preferences and key trade-offs"
  }
]

Score 0-100. Sort best first. Be specific and confident — this is enterprise-grade reasoning.`;

  // Stream the response
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    let fullText = '';

    const stream = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        fullText += event.delta.text;
        res.write(`data: ${JSON.stringify({ chunk: event.delta.text })}\n\n`);
      }
    }

    // Parse and send final results
    let results;
    try {
      results = JSON.parse(fullText);
    } catch {
      const match = fullText.match(/\[[\s\S]*\]/);
      results = match ? JSON.parse(match[0]) : [];
    }

    res.write(`data: ${JSON.stringify({ done: true, results })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Anthropic API error:', err);
    res.write(`data: ${JSON.stringify({ error: 'Agent error. Please try again.' })}\n\n`);
    res.end();
  }
}
