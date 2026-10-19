// src/lib/gridfs.ts
import { MongoClient, GridFSBucket } from "mongodb";

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

function getMongoClient(): Promise<MongoClient> {
  // 🛑 Если идет процесс сборки, не даем клиенту подключаться к сети
  if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.BUILDING === 'true') {
    return Promise.reject(new Error("MongoDB connection disabled during build phase"));
  }

  if (!client) {
    const uri = process.env.MONGODB_URI || "";
    if (!uri) {
      throw new Error("Пожалуйста, добавьте MONGODB_URI в переменные окружения");
    }
    client = new MongoClient(uri);
    clientPromise = client.connect();
  }

  return clientPromise!;
}

export async function getGridFSBuckets() {
  const dbClient = await getMongoClient();
  const db = dbClient.db();
  const bucket = new GridFSBucket(db, { bucketName: "uploads" });
  return { bucket, db };
}