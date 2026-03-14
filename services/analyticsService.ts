import type { LanguageCode } from '../types';

// A simple hashing function to create deterministic "randomness" from the location string
const simpleHash = (str: string): number => {
  let hash = 0;
  if (!str) return hash;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

export interface SoilHealth {
  n: { value: number; status: 'optimal' | 'low' | 'high' };
  p: { value: number; status: 'optimal' | 'low' | 'high' };
  k: { value: number; status: 'optimal' | 'low' | 'high' };
  ph: number;
}

export interface ResourceInsights {
    rainfall: { deviation: number };
    market: { forecast: 'strong' | 'stable' | 'weak' };
}

export interface MarketTrend {
    month: string;
    price: number;
}

export interface YieldPrediction {
    crop: string;
    predictedYield: number; // in tons/hectare
    confidence: number; // percentage
}

export interface PestPrediction {
    pestName: string;
    probability: number; // percentage
}

export interface PlantingAdvice {
  recommendedCrop: string;
  reason: string;
}

export interface DistrictBenchmark {
    rank: string; // e.g., 'Top 25%'
    note: string;
}

export interface CurrentWeather {
    temp: string;
    condition: string;
    humidity: number;
}

export interface DashboardAnalytics {
  weather: { temp: string; condition: 'Partly Cloudy' | 'Sunny' | 'Light Showers' | 'Clear Skies' | 'Humid' };
  pestAlerts: { level: 'low' | 'medium' | 'high'; message: string };
  soilHealth: SoilHealth;
  resourceInsights: ResourceInsights;
  marketTrends: { crop: string; data: MarketTrend[] };
  yieldPrediction: YieldPrediction;
  plantingAdvisor: PlantingAdvice;
  districtBenchmark: DistrictBenchmark;
  pestOutbreakPrediction: PestPrediction;
}

const getStatus = (value: number, optimal: number, range: number): 'optimal' | 'low' | 'high' => {
    if (value > optimal + range) return 'high';
    if (value < optimal - range) return 'low';
    return 'optimal';
};

// This service simulates fetching data from a Big Data backend.
export const analyticsService = {
  getCurrentWeather: (location: string): CurrentWeather => {
    const hash = simpleHash(location);
    const conditions = ['Partly Cloudy', 'Sunny', 'Light Showers', 'Clear Skies', 'Humid'] as const;
    return {
      temp: `${28 + (hash % 8)}°C`,
      condition: conditions[hash % conditions.length],
      humidity: 60 + (hash % 25),
    };
  },

  getDashboardAnalytics: (location: string): DashboardAnalytics => {
    const hash = simpleHash(location);

    const crops = ['Tomato', 'Onion', 'Wheat', 'Sugarcane', 'Cotton', 'Soybean'];
    const pests = ['Aphids', 'Bollworm', 'Whitefly', 'Stem Borer', 'Thrips'];
    
    // Generate Market Trends data
    const trendData: MarketTrend[] = Array.from({ length: 6 }, (_, i) => {
        const priceFluctuation = (simpleHash(`${location}-month-${i}`) % 20) - 10;
        return {
            month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'][i],
            price: 180 + (i * 5) + priceFluctuation,
        };
    });

    return {
      weather: {
        temp: `${28 + (hash % 8)}°C`,
        // FIX: Add `as const` to the array to ensure TypeScript infers a tuple of literal types, not `string[]`. This resolves the type mismatch with the `DashboardAnalytics` interface.
        condition: (['Partly Cloudy', 'Sunny', 'Light Showers', 'Clear Skies', 'Humid'] as const)[hash % 5],
      },
      pestAlerts: {
        level: ['low', 'medium', 'high'][hash % 3] as 'low' | 'medium' | 'high',
        message: [
            "Monitor your wheat crop for Yellow Rust disease.",
            "High probability of locust swarms detected in western regions.",
            "Increased sightings of the Fall Armyworm pest in maize fields.",
        ][hash % 3],
      },
      soilHealth: {
        n: { value: 120 + ((hash % 50) - 25), status: getStatus(120 + ((hash % 50) - 25), 130, 10) },
        p: { value: 45 + ((hash % 20) - 10), status: getStatus(45 + ((hash % 20) - 10), 50, 5) },
        k: { value: 60 + ((hash % 20) - 10), status: getStatus(60 + ((hash % 20) - 10), 65, 5) },
        ph: parseFloat((6.2 + (hash % 15) / 10).toFixed(1)),
      },
      resourceInsights: {
          rainfall: { deviation: (hash % 30) - 15 },
          market: { forecast: ['strong', 'stable', 'weak'][hash % 3] as 'strong' | 'stable' | 'weak' }
      },
      marketTrends: {
          crop: `${crops[(hash + 1) % crops.length]}`,
          data: trendData
      },
      yieldPrediction: {
          crop: crops[hash % crops.length],
          predictedYield: parseFloat((4.5 + (hash % 20) / 10).toFixed(1)),
          confidence: 85 + (hash % 10)
      },
      plantingAdvisor: {
        recommendedCrop: ['Sugarcane', 'Cotton', 'Soybean', 'Maize'][hash % 4],
        reason: [
            'High market demand is forecasted and current soil moisture is optimal.',
            'Favorable long-range weather predictions and stable market prices.',
            'Excellent for crop rotation to improve soil nitrogen levels for the following season.',
            'Short growth cycle and rising demand from the local poultry feed industry.'
        ][hash % 4],
      },
      districtBenchmark: {
          rank: ['Top 10%', 'Top 25%', 'Top 50%', 'Average'][hash % 4],
          note: 'Based on last season\'s yield data for your primary crop.'
      },
      pestOutbreakPrediction: {
          pestName: pests[hash % pests.length],
          probability: 60 + (hash % 35)
      }
    };
  },
};
