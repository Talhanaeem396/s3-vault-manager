import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { ObjectId } from "mongodb";
import crypto from "crypto";
import { getDb } from "./db.js";

dotenv.config();

const {
  MYSQL_HOST = "localhost",
  MYSQL_PORT = "3306",
  MYSQL_USER = "root",
  MYSQL_PASSWORD = "",
  MYSQL_DATABASE = "",
} = process.env;

const normalizeDate = (value) => {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const parseJson = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const toMd5 = (value) => crypto.createHash("md5").update(String(value)).digest("hex");

const main = async () => {
  if (!MYSQL_DATABASE) {
    throw new Error("Missing MYSQL_DATABASE for migration.");
  }

  const mysqlConn = await mysql.createConnection({
    host: MYSQL_HOST,
    port: Number(MYSQL_PORT),
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
  });

  const db = await getDb();
  const usersCol = db.collection("users");
  const sessionsCol = db.collection("sessions");
  const filesCol = db.collection("files");
  const logsCol = db.collection("fileActivityLogs");

  const [mysqlUsers] = await mysqlConn.query("SELECT * FROM users");
  const userIdMap = new Map();

  for (const row of mysqlUsers) {
    const newId = new ObjectId();
    userIdMap.set(row.id, newId);
    const existing = await usersCol.findOne({ email: row.email });
    if (existing) {
      userIdMap.set(row.id, existing._id);
      await usersCol.updateOne(
        { _id: existing._id },
        {
          $set: {
            email: row.email,
            password: row.password?.length === 32 ? row.password : toMd5(row.password || ""),
            fullName: row.full_name || null,
            role: row.role || "admin",
            createdAt: normalizeDate(row.created_at),
          },
        }
      );
    } else {
      await usersCol.insertOne({
        _id: newId,
        email: row.email,
        password: row.password?.length === 32 ? row.password : toMd5(row.password || ""),
        fullName: row.full_name || null,
        role: row.role || "admin",
        createdAt: normalizeDate(row.created_at),
      });
    }
  }

  const [mysqlSessions] = await mysqlConn.query("SELECT * FROM sessions");
  for (const row of mysqlSessions) {
    const userId = userIdMap.get(row.user_id);
    if (!userId) continue;
    await sessionsCol.updateOne(
      { token: row.token },
      {
        $set: {
          userId,
          token: row.token,
          expiresAt: normalizeDate(row.expires_at),
          createdAt: normalizeDate(row.created_at),
        },
      },
      { upsert: true }
    );
  }

  const [mysqlFiles] = await mysqlConn.query("SELECT * FROM files");
  for (const row of mysqlFiles) {
    const userId = userIdMap.get(row.user_id);
    await filesCol.updateOne(
      { filePath: row.file_path },
      {
        $set: {
          userId: userId || null,
          filePath: row.file_path,
          fileName: row.file_name || row.file_path?.split("/").pop() || row.file_path,
          size: row.size || 0,
          isFolder: String(row.file_path || "").endsWith("/"),
          updatedAt: normalizeDate(row.updated_at),
        },
      },
      { upsert: true }
    );
  }

  const [mysqlLogs] = await mysqlConn.query("SELECT * FROM file_activity_logs");
  for (const row of mysqlLogs) {
    const userId = userIdMap.get(row.user_id);
    await logsCol.insertOne({
      action: row.action,
      filePath: row.file_path,
      fileName: row.file_name || null,
      details: parseJson(row.details),
      userId: userId || null,
      createdAt: normalizeDate(row.created_at),
    });
  }

  await mysqlConn.end();
  // eslint-disable-next-line no-console
  console.log("Migration complete.");
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Migration failed:", error);
  process.exit(1);
});
