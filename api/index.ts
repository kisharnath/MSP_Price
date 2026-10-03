import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { connectToDatabase, getDatabaseName, getMongoUri } from './mongoClient.js';
import { upsertMspData, round2 } from './mspSchema.js';
import { MSP_SEED } from './mspSeedData.js';

dotenv.config();

const app = express();
app.use(express.json({ limit: '10mb' }));

// Helper to mask sensitive password in MongoDB URI
function maskMongoUri(uri: string): string {
  if (!uri) return '';
  return uri.replace(/\/\/(.*?):(.*?)@/, '//***:***@');
}

// 1. Status Check Route
app.get('/api/mongodb/status', async (req: Request, res: Response) => {
  const uri = getMongoUri();
  const dbName = getDatabaseName();

  if (!uri) {
    return res.json({
      configured: false,
      connected: false,
      maskedUri: null,
      database: dbName,
      message: 'MONGODB_URI is not set in .env or Vercel Environment Variables.'
    });
  }

  try {
    const client = await connectToDatabase();
    const db = client.db(dbName);
    const docsCount = await db.collection('msp_documents').countDocuments();
    const recsCount = await db.collection('msp_records').countDocuments();

    return res.json({
      configured: true,
      connected: true,
      maskedUri: maskMongoUri(uri),
      database: dbName,
      stats: {
        documents: docsCount,
        records: recsCount
      },
      message: 'Successfully connected to MongoDB Atlas!'
    });
  } catch (err: any) {
    let hint = 'Check your connection string, username/password, and IP Whitelist in MongoDB Atlas.';
    if (err.message && err.message.includes('bad auth')) {
      hint = 'Authentication failed: Verify username and password in MONGODB_URI.';
    } else if (err.message && (err.message.includes('timed out') || err.message.includes('Server selection timed out'))) {
      hint = 'Connection timed out: Check MongoDB Atlas Network Access -> IP Access List -> Allow access from anywhere (0.0.0.0/0).';
    }

    return res.status(200).json({
      configured: true,
      connected: false,
      maskedUri: maskMongoUri(uri),
      database: dbName,
      error: err.message || 'Unknown connection error',
      hint
    });
  }
});

// 2. Test Custom URI Route
app.post('/api/mongodb/test', async (req: Request, res: Response) => {
  const { uri, database } = req.body;
  const testUri = uri || getMongoUri();
  const dbName = database || getDatabaseName();

  if (!testUri) {
    return res.status(400).json({
      success: false,
      error: 'Please provide a MongoDB connection string (e.g., mongodb+srv://...)'
    });
  }

  try {
    const client = await connectToDatabase(testUri);
    const db = client.db(dbName);
    await db.command({ ping: 1 });

    return res.json({
      success: true,
      message: `Successfully connected to MongoDB database '${dbName}'!`,
      maskedUri: maskMongoUri(testUri)
    });
  } catch (err: any) {
    let hint = 'Ensure username/password are correct and IP access is set to 0.0.0.0/0 on MongoDB Atlas.';
    if (err.message && err.message.includes('bad auth')) {
      hint = 'Authentication failed: Invalid credentials in connection string.';
    } else if (err.message && err.message.includes('timed out')) {
      hint = 'Network timeout: Go to MongoDB Atlas -> Network Access -> Add IP Address: 0.0.0.0/0.';
    }

    return res.status(400).json({
      success: false,
      error: err.message,
      hint
    });
  }
});

// 3. Save Document and Crop Records into MongoDB Atlas
app.post('/api/mongodb/save', async (req: Request, res: Response) => {
  const { metadata, records, uri, database } = req.body;
  const targetUri = uri || getMongoUri();
  const dbName = database || getDatabaseName();

  if (!targetUri) {
    return res.status(400).json({
      success: false,
      error: 'MONGODB_URI is not configured! Please set it in .env, Vercel Environment Variables, or enter it in the MongoDB Settings tab.'
    });
  }

  if (!metadata || !records || records.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid payload: metadata and candidate records are required.'
    });
  }

  try {
    const client = await connectToDatabase(targetUri);
    const db = client.db(dbName);

    // 1. Prepare Document with BSON Date
    const now = new Date();
    let publishedDate = now;
    if (metadata.published_at) {
      const parsed = new Date(metadata.published_at);
      if (!isNaN(parsed.getTime())) {
        publishedDate = parsed;
      }
    }

    const docId = metadata._id || `PIB_${(metadata.season || 'RABI').toUpperCase()}_${(metadata.marketing_year || '2027-28').replace(/[^a-zA-Z0-9]/g, '_')}`;

    const season = metadata.season || 'Rabi';
    const marketingYear = metadata.marketing_year || '2027-28';
    const num = (v: any) => (typeof v === 'number' && !isNaN(v) ? v : null);

    const recDocs = records.map((r: any) => {
      const cropId = (r.crop_id || 'unknown').toLowerCase();
      const msp = typeof r.msp === 'number' ? r.msp : parseFloat(String(r.msp || 0));
      const prev = num(r.prev_year_msp);
      const inc = num(r.increase_abs);
      return {
        _id: `${docId}_${cropId.toUpperCase()}`,
        document_id: docId,
        serial_no: num(r.serial_no),
        crop_id: cropId,
        crop_name: r.crop_name,
        crop_group: r.crop_group ?? null,
        variety: r.variety ?? null,
        category: r.category ?? null,
        crop_aliases: Array.isArray(r.crop_aliases) ? r.crop_aliases : [],
        season,
        marketing_year: marketingYear,
        unit: r.unit || 'INR/quintal',
        msp,
        cost_of_production: num(r.cost_of_production),
        margin_percent: num(r.margin_percent),
        prev_year_label: r.prev_year_label ?? null,
        prev_year_msp: prev,
        increase_abs: inc,
        increase_pct: prev && inc !== null ? round2((inc / prev) * 100) : null,
        base_year_label: r.base_year_label ?? null,
        base_year_msp: num(r.base_year_msp),
        increase_over_base_abs: num(r.increase_over_base_abs),
        increase_over_base_pct: num(r.increase_over_base_pct),
        notes: Array.isArray(r.notes) ? r.notes : [],
        published_at: publishedDate,
        validation_status: 'valid' as const,
      };
    });

    await upsertMspData(
      db,
      {
        _id: docId,
        title: metadata.title || `Cabinet approves MSP for ${season} Crops`,
        source_name: metadata.source_name || 'Press Information Bureau',
        source_url: metadata.source_url || '',
        press_release_id: metadata.press_release_id ?? null,
        file_name: metadata.file_name || 'notification.pdf',
        season,
        marketing_year: marketingYear,
        published_at: publishedDate,
        content_hash: metadata.content_hash || '',
        verification_status: 'verified',
        crop_count: recDocs.length,
        highlights: metadata.highlights || {},
      },
      recDocs
    );
    const savedRecords = recDocs.map((r: any) => r._id);

    return res.json({
      success: true,
      message: `🎉 Successfully persisted into MongoDB Atlas! Document '${docId}' and ${savedRecords.length} crop records written to '${dbName}'.`,
      database: dbName,
      documentId: docId,
      recordsCount: savedRecords.length,
      savedRecords
    });
  } catch (err: any) {
    console.error('MongoDB Atlas save error:', err);
    let hint = 'Please verify your MongoDB Atlas connection string and ensure IP whitelist includes 0.0.0.0/0.';
    if (err.message && err.message.includes('bad auth')) {
      hint = 'Authentication failed: Check your username and password in the connection string.';
    } else if (err.message && (err.message.includes('timed out') || err.message.includes('ENOTFOUND'))) {
      hint = 'Network error: Verify your cluster hostname and ensure MongoDB Atlas allows connections from 0.0.0.0/0.';
    }

    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to save to MongoDB',
      hint
    });
  }
});

// 3b. Seed the bundled Kharif 2026-27 and Rabi 2027-28 releases
app.post('/api/mongodb/seed', async (req: Request, res: Response) => {
  const { uri, database } = req.body || {};
  const targetUri = uri || getMongoUri();
  if (!targetUri) {
    return res.status(400).json({ success: false, error: 'MONGODB_URI is not configured.' });
  }
  try {
    const client = await connectToDatabase(targetUri);
    const db = client.db(database || getDatabaseName());
    const results = [];
    for (const { doc, records } of MSP_SEED) results.push(await upsertMspData(db, doc, records));
    return res.json({ success: true, results });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Fetch Documents from MongoDB Atlas
app.get('/api/mongodb/documents', async (req: Request, res: Response) => {
  const uri = getMongoUri();
  const dbName = getDatabaseName();

  if (!uri) {
    return res.status(400).json({ success: false, error: 'MONGODB_URI not configured.' });
  }

  try {
    const client = await connectToDatabase();
    const db = client.db(dbName);
    const docs = await db.collection('msp_documents').find({}).sort({ published_at: -1 }).toArray();
    return res.json({ success: true, documents: docs });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Fetch Records from MongoDB Atlas
app.get('/api/mongodb/records', async (req: Request, res: Response) => {
  const uri = getMongoUri();
  const dbName = getDatabaseName();

  if (!uri) {
    return res.status(400).json({ success: false, error: 'MONGODB_URI not configured.' });
  }

  try {
    const client = await connectToDatabase();
    const db = client.db(dbName);
    const { crop, season, year } = req.query;

    const query: any = { validation_status: 'valid' };
    if (crop && crop !== 'All') query.crop_id = String(crop);
    if (season && season !== 'All') query.season = new RegExp(`^${season}$`, 'i');
    if (year && year !== 'All') query.marketing_year = String(year);

    const recs = await db.collection('msp_records').find(query).sort({ published_at: -1 }).toArray();
    return res.json({ success: true, records: recs });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default app;
