/**
 * Client service to communicate with backend MongoDB Atlas API routes (/api/mongodb/*).
 * Provides live connection checks, failure diagnostics, and direct database saves.
 */

import { DocumentMetadata, ExtractedCropRecord } from './pdfExtractorClient';

export interface MongoStatusResponse {
  configured: boolean;
  connected: boolean;
  maskedUri: string | null;
  database: string;
  stats?: {
    documents: number;
    records: number;
  };
  message?: string;
  error?: string;
  hint?: string;
}

export interface MongoSaveResponse {
  success: boolean;
  message: string;
  database?: string;
  documentId?: string;
  recordsCount?: number;
  error?: string;
  hint?: string;
}

export class MongoApiClient {
  private static customUri: string = '';
  private static customDb: string = 'agriculture_db';

  public static setCustomConfig(uri: string, dbName: string) {
    this.customUri = uri.trim();
    if (dbName && dbName.trim()) {
      this.customDb = dbName.trim();
    }
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('msp_custom_mongo_uri', this.customUri);
        localStorage.setItem('msp_custom_mongo_db', this.customDb);
      } catch {
        // ignore
      }
    }
  }

  public static getSavedCustomConfig(): { uri: string; database: string } {
    if (typeof window !== 'undefined') {
      try {
        const u = localStorage.getItem('msp_custom_mongo_uri') || '';
        const d = localStorage.getItem('msp_custom_mongo_db') || 'agriculture_db';
        this.customUri = u;
        this.customDb = d;
        return { uri: u, database: d };
      } catch {
        // ignore
      }
    }
    return { uri: this.customUri, database: this.customDb };
  }

  public static async checkStatus(): Promise<MongoStatusResponse> {
    try {
      const res = await fetch('/api/mongodb/status');
      if (!res.ok) {
        throw new Error(`API responded with status ${res.status}`);
      }
      return await res.json();
    } catch (e: any) {
      return {
        configured: false,
        connected: false,
        maskedUri: null,
        database: 'agriculture_db',
        error: e.message || 'Unable to connect to /api/mongodb/status endpoint',
        hint: 'Ensure server is running or check network connection.'
      };
    }
  }

  public static async testConnection(uri?: string, database?: string): Promise<{ success: boolean; message: string; hint?: string }> {
    try {
      const payload: any = {};
      if (uri) payload.uri = uri;
      if (database) payload.database = database;

      const res = await fetch('/api/mongodb/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          success: false,
          message: data.error || 'Connection test failed',
          hint: data.hint
        };
      }
      return {
        success: true,
        message: data.message || 'Connected successfully to MongoDB Atlas!'
      };
    } catch (e: any) {
      return {
        success: false,
        message: e.message || 'Failed to reach /api/mongodb/test',
        hint: 'Check if the backend server is active.'
      };
    }
  }

  public static async saveToAtlas(
    metadata: DocumentMetadata,
    records: ExtractedCropRecord[]
  ): Promise<MongoSaveResponse> {
    const config = this.getSavedCustomConfig();

    try {
      const res = await fetch('/api/mongodb/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadata,
          records,
          uri: config.uri || undefined,
          database: config.database || undefined
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          success: false,
          message: data.error || 'Failed to save to MongoDB Atlas',
          hint: data.hint
        };
      }

      return {
        success: true,
        message: data.message,
        database: data.database,
        documentId: data.documentId,
        recordsCount: data.recordsCount
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Network error saving to MongoDB Atlas: ${e.message}`,
        hint: 'Verify server is running and MONGODB_URI is accessible.'
      };
    }
  }
}
