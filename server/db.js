import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const { MONGODB_URI = "", MONGODB_DB = "digimedia" } = process.env;

let client;
let db;

export async function getDb() {
  if (!MONGODB_URI) {
    throw new Error("Missing MONGODB_URI in environment variables.");
  }

  if (!client) {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
  }

  if (!db) {
    db = client.db(MONGODB_DB);
  }

  return db;
}

export async function dbCheck() {
  const database = await getDb();
  await database.command({ ping: 1 });
}
