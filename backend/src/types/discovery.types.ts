import { ExtractedPurchaseIntent } from './llm.types';

export enum ResultQualityTier {
  OFFICIAL_PRICING = 1,
  OFFICIAL_PRODUCT = 2,
  OFFICIAL_WEBSITE = 3,
  COMPARISON_REVIEW = 4,
}

export interface DiscoveredProduct {
  title: string;
  sourceUrl: string;
  merchantName: string | null;
  merchantDomain: string | null;
  description: string;
  relevanceScore: number;
  unverifiedListedPrice: number | null;
  currency: string | null;
}

export interface DiscoveryRequest {
  message: string;
  maxResults?: number;
}

export interface DiscoveryResponse {
  query: string;
  extractedIntent?: ExtractedPurchaseIntent | null;
  resultsCount: number;
  results: DiscoveredProduct[];
}

export interface TavilySearchRequest {
  api_key: string;
  query: string;
  search_depth?: 'basic' | 'advanced';
  include_answer?: boolean;
  max_results?: number;
  exclude_domains?: string[];
}

export interface TavilySearchResultItem {
  title: string;
  url: string;
  content: string;
  score?: number;
  raw_content?: string | null;
}

export interface TavilySearchResponse {
  query: string;
  results: TavilySearchResultItem[];
  response_time?: number;
}
