
import { GoogleGenAI, Type } from '@google/genai';
import type { LanguageCode } from '../types';
import { LANGUAGES, INDIAN_STATES_DISTRICTS } from '../constants';

// Initialize with environment API key
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

// Helper function to convert a File object to a GoogleGenerativeAI.Part object
const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result) {
        resolve((reader.result as string).split(',')[1]);
      } else {
        reject(new Error("Failed to read file."));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });

  return {
    inlineData: {
      data: await base64EncodedDataPromise,
      mimeType: file.type,
    },
  };
};

const getSystemInstruction = (context: { state: string; district: string; crop: string }, language: LanguageCode) => {
  const langName = {
    en: 'English',
    hi: 'Hindi',
    mr: 'Marathi',
    ml: 'Malayalam',
    gu: 'Gujarati',
    ra: 'Rajasthani'
  };

  return `You are Agri-Intel, an expert polyglot AI agricultural assistant for Indian farmers. 

CONTEXT:
- Location: ${context.district}, ${context.state}
- Current Crop focus: ${context.crop}
- Default Language: ${langName[language]}

CRITICAL RULES:
1. **LANGUAGE FLEXIBILITY:** While the default is ${langName[language]}, if the user asks you to switch to another language (Hindi, Marathi, Gujarati, Rajasthani, etc.), you MUST comply immediately. If they ask for a translation of a previous response, provide it in the requested language.
2. **STRICT SCOPE:** You ONLY answer questions related to agriculture, farming, crops, livestock, and pest management. 
3. **REFUSAL:** If the user asks for C programming, Python code, web development, or any non-agricultural task, politely refuse. Say: "I am specialized in agricultural advisory only. I cannot help with coding or other non-farming tasks."
4. **PROACTIVE MEASURES:** When diagnosing a problem (disease or pest), always ask: "Would you like me to suggest specific prevention measures or treatments for this?"
5. **IDENTITY:** If asked "who made you" or "who created you", you MUST answer: "I was made by students of SJCEM for MegaHack 2026 hackathon."

Developed by students of SJCEM for MegaHack 2026 hackathon. Use Markdown for formatting.`;
};

export const getAIResponse = async (
  inputText: string,
  imageFile: File | null,
  context: { state: string; district: string; crop: string },
  language: LanguageCode
) => {
  const model = 'gemini-3-flash-preview';
  const systemInstruction = getSystemInstruction(context, language);
  
  const textPart = { text: `User's input: "${inputText}"` };
  const contentParts = [];

  if (imageFile) {
    const imagePart = await fileToGenerativePart(imageFile);
    contentParts.push(imagePart);
  }
  contentParts.push(textPart);

  const stream = await ai.models.generateContentStream({
    model: model,
    contents: { parts: contentParts },
    config: {
      systemInstruction: systemInstruction,
    }
  });

  return stream;
};

export const parseLoginDetailsFromSpeech = async (transcript: string): Promise<{name: string | null, lang: LanguageCode | null, state: string | null, district: string | null}> => {
    const model = 'gemini-3-flash-preview';
    const allLangs = LANGUAGES.map(l => l.name).join(', ');
    const allStates = Object.keys(INDIAN_STATES_DISTRICTS).join(', ');

    const prompt = `Extract user details from transcript: "${transcript}".
    Return JSON: { "name": string|null, "lang": "en"|"hi"|"mr"|"ml"|"gu"|"ra"|null, "state": string|null, "district": string|null }
    
    Language options: [${allLangs}]
    State options: [${allStates}]

    Map language names correctly: 'Gujarati' to 'gu', 'Marathi' to 'mr', 'Rajasthani' to 'ra'.
    Only return JSON.`;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        const parsedJson = JSON.parse(response.text.trim());
        const name = typeof parsedJson.name === 'string' ? parsedJson.name : null;
        const lang = typeof parsedJson.lang === 'string' && ['en', 'hi', 'mr', 'ml', 'gu', 'ra'].includes(parsedJson.lang) ? parsedJson.lang as LanguageCode : null;
        const state = typeof parsedJson.state === 'string' && INDIAN_STATES_DISTRICTS[parsedJson.state] ? parsedJson.state : null;
        let district = null;
        if (state && typeof parsedJson.district === 'string' && INDIAN_STATES_DISTRICTS[state].includes(parsedJson.district)) {
            district = parsedJson.district;
        }

        return { name, lang, state, district };
    } catch (e) {
        console.error("Login parsing failed:", e);
        return { name: null, lang: null, state: null, district: null };
    }
};
