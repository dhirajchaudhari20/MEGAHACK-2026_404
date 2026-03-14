import { GoogleGenAI, Type } from "@google/genai";
import type { NewsArticle, LanguageCode } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function getFarmerNews(language: LanguageCode, state: string, district: string): Promise<NewsArticle[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Fetch the latest real-time agricultural and farming news specifically for farmers in ${district}, ${state}, India. 
      The news should be relevant to current farming activities, government schemes, weather impact, or market prices in this region.
      Provide the response in ${language} language.
      Return exactly 5-8 news articles.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              summary: { type: Type.STRING },
              url: { type: Type.STRING },
              source: { type: Type.STRING },
              publishedAt: { type: Type.STRING },
              imageUrl: { type: Type.STRING }
            },
            required: ["title", "summary", "url", "source", "publishedAt"]
          }
        }
      },
    });

    const text = response.text;
    if (!text) return [];
    
    try {
      const articles = JSON.parse(text);
      return articles;
    } catch (e) {
      console.error("Failed to parse news JSON", e);
      return [];
    }
  } catch (error) {
    console.error("Error fetching news:", error);
    return [];
  }
}
