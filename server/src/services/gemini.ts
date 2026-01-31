// Gemini AI service for quest generation and insights

interface QuestGenerationParams {
  userLevel: number;
  visitedCategories: string[];
  currentLocation: { lat: number; lng: number };
  nearbyBusinesses: { name: string; category: string }[];
}

interface GeneratedQuest {
  title: string;
  description: string;
  requirements: {
    visitCount?: number;
    uniqueCategories?: number;
    specificBusinesses?: string[];
  };
  pointsReward: number;
}

interface BusinessInsight {
  summary: string;
  trends: string[];
  recommendations: string[];
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

async function callGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json() as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function generateQuest(params: QuestGenerationParams): Promise<GeneratedQuest> {
  const prompt = `Generate a city exploration quest for a level ${params.userLevel} user.

They have visited these categories: ${params.visitedCategories.join(', ') || 'none yet'}.
Nearby businesses include: ${params.nearbyBusinesses.map(b => `${b.name} (${b.category})`).join(', ')}.

Create an engaging quest that encourages exploration. Return ONLY valid JSON in this exact format:
{
  "title": "Quest title (max 50 chars)",
  "description": "Fun, engaging description (max 200 chars)",
  "requirements": {
    "visitCount": number or null,
    "uniqueCategories": number or null
  },
  "pointsReward": number between 25-100
}`;

  try {
    const response = await callGemini(prompt);
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    // Fallback quest if API fails
    return {
      title: 'Local Explorer',
      description: 'Visit 3 new places in your area to discover hidden gems!',
      requirements: { visitCount: 3 },
      pointsReward: 30
    };
  }
}

export async function generateSocialCaption(params: {
  checkinCount: number;
  uniquePlaces: number;
  topCategory: string;
  zonesCaptured: number;
}): Promise<string> {
  const prompt = `Generate a fun, shareable social media caption for someone's city exploration recap.

Stats:
- ${params.checkinCount} places visited
- ${params.uniquePlaces} unique locations
- Favorite category: ${params.topCategory}
- ${params.zonesCaptured} neighborhoods captured

Keep it under 150 characters, make it engaging and include 1-2 relevant emojis. Don't use hashtags.`;

  try {
    const response = await callGemini(prompt);
    return response.trim().replace(/^["']|["']$/g, '');
  } catch (error) {
    return `Explored ${params.checkinCount} spots and captured ${params.zonesCaptured} neighborhoods! 🗺️`;
  }
}

export async function generateBusinessInsights(params: {
  businessName: string;
  totalCheckins: number;
  uniqueVisitors: number;
  peakHours: number[];
  category: string;
}): Promise<BusinessInsight> {
  const prompt = `Analyze this business's visitor data and provide insights:

Business: ${params.businessName} (${params.category})
Total check-ins: ${params.totalCheckins}
Unique visitors: ${params.uniqueVisitors}
Peak hours: ${params.peakHours.join(', ')}

Return ONLY valid JSON:
{
  "summary": "One sentence overview",
  "trends": ["trend 1", "trend 2"],
  "recommendations": ["actionable recommendation 1", "actionable recommendation 2"]
}`;

  try {
    const response = await callGemini(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found');
    }
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    return {
      summary: `${params.businessName} has ${params.totalCheckins} check-ins from ${params.uniqueVisitors} visitors.`,
      trends: ['Consistent visitor traffic'],
      recommendations: ['Consider running promotions during off-peak hours']
    };
  }
}
