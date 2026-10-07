// src/lib/gridfs.ts
import { MongoClient, GridFSBucket } from "mongodb";

const uri = process.env.MONGODB_URI || "";
if (!uri) {
  throw new Error("Пожалуйста, добавьте MONGODB_URI в переменные окружения");
}

let client = new MongoClient(uri);
let clientPromise = client.connect();

export async function getGridFSBuckets() {
  const dbClient = await clientPromise;
  const db = dbClient.db();
  const bucket = new GridFSBucket(db, { bucketName: "uploads" });
  return { bucket, db };
}