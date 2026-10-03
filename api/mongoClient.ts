import { MongoClient, ServerApiVersion } from 'mongodb';

let cachedClient: MongoClient | null = null;

export function getMongoUri(): string {
  return process.env.MONGODB_URI || process.env.VITE_MONGODB_URI || '';
}

export function getDatabaseName(): string {
  return process.env.MONGODB_DATABASE || 'agriculture_db';
}

export async function connectToDatabase(customUri?: string) {
  const uri = customUri || getMongoUri();
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Please configure MONGODB_URI in your .env or Vercel Environment Variables, or enter it in the UI.');
  }

  // If using custom URI, create temporary client; otherwise reuse cached
  if (customUri && customUri !== getMongoUri()) {
    const tempClient = new MongoClient(customUri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: false,
        deprecationErrors: true,
      },
      connectTimeoutMS: 8000,
      serverSelectionTimeoutMS: 8000
    });
    await tempClient.connect();
    // Ping to verify authentication & IP whitelist
    await tempClient.db().command({ ping: 1 });
    return tempClient;
  }

  if (cachedClient) {
    try {
      await cachedClient.db().command({ ping: 1 });
      return cachedClient;
    } catch {
      cachedClient = null;
    }
  }

  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: false,
      deprecationErrors: true,
    },
    connectTimeoutMS: 8000,
    serverSelectionTimeoutMS: 8000
  });

  await client.connect();
  await client.db().command({ ping: 1 });
  cachedClient = client;
  return client;
}
