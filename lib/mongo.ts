import { MongoClient, Db } from "mongodb";

// One cached client (Mongo manages its own connection pool inside the client).
const g = globalThis as unknown as { mongoClient?: Promise<MongoClient> };

export async function getDb(): Promise<Db> {
  if (!g.mongoClient) {
    g.mongoClient = new MongoClient(process.env.MONGODB_URI!, {
      serverSelectionTimeoutMS: 4000, // fail fast (default 30 s) so pages degrade quickly when MongoDB is down
    })
      .connect()
      .catch((err) => {
        g.mongoClient = undefined; // do not cache a failed connection: the next request tries again
        throw err;
      });
  }
  const client = await g.mongoClient;
  return client.db(process.env.MONGODB_DB);
}
