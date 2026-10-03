import dotenv from 'dotenv';
import { connectToDatabase, getDatabaseName } from './api/mongoClient.js';
import { MSP_SEED } from './api/mspSeedData.js';
import { upsertMspData } from './api/mspSchema.js';

dotenv.config();

const client = await connectToDatabase();
const db = client.db(getDatabaseName());
for (const { doc, records } of MSP_SEED) {
  console.log(await upsertMspData(db, doc, records));
}
await client.close();
