import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
import { ObjectId } from "mongodb";
import { getDb, dbCheck } from "./db.js";
import { uploadS3Object, deleteS3Object, getS3DownloadUrl, createS3Folder, deleteS3Prefix, copyS3Object, copyS3Prefix } from "./s3.js";

dotenv.config();

const app = express();

const PORT = Number(process.env.SERVER_PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:8080";
const TOKEN_TTL_DAYS = Number(process.env.TOKEN_TTL_DAYS || 7);

app.use(
  cors({
    origin: CLIENT_ORIGIN,
  })
);
app.use(express.json({ limit: "200mb" }));

const normalizeKey = (key) => {
  const rawInput = key ?? "";
  const raw = String(rawInput).replace(/\\/g, "/");
  if (!raw) return "";
  const normalized = path.posix.normalize(raw).replace(/^(\.\.(\/|$))+/, "");
  return normalized.replace(/^\/+/, "");
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getCollections = async () => {
  const db = await getDb();
  return {
    users: db.collection("users"),
    sessions: db.collection("sessions"),
    files: db.collection("files"),
    logs: db.collection("fileActivityLogs"),
  };
};

const getAuthToken = (req) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7);
};

const getUserByToken = async (token) => {
  if (!token) return null;
  const { sessions, users } = await getCollections();
  const session = await sessions.findOne({
    token,
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;
  const user = await users.findOne({ _id: session.userId });
  if (!user) return null;
  return { id: user._id.toString(), email: user.email, role: user.role };
};

const requireAuth = async (req, res, next) => {
  try {
    const token = getAuthToken(req);
    const user = await getUserByToken(token);
    if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });
    req.user = user;
    req.token = token;
    return next();
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Auth error" });
  }
};

const requireAdmin = async (req, res, next) => {
  await requireAuth(req, res, next);
};

const logFileAction = async (action, filePath, fileName, userId, details) => {
  const { logs } = await getCollections();
  await logs.insertOne({
    action,
    filePath,
    fileName,
    details: details || null,
    userId: userId ? new ObjectId(userId) : null,
    createdAt: new Date(),
  });
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/db-check", async (_req, res) => {
  try {
    await dbCheck();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Database error",
    });
  }
});

app.get("/api/db-info", requireAuth, async (_req, res) => {
  try {
    const db = await getDb();
    const { files } = await getCollections();
    const filesCount = await files.countDocuments();
    res.json({
      ok: true,
      database: db.databaseName || null,
      filesCount,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Database error",
    });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email and password are required" });
    }

    const passwordHash = crypto.createHash("md5").update(password).digest("hex");
    const { users, sessions } = await getCollections();
    const user = await users.findOne({ email });
    if (!user) return res.status(401).json({ ok: false, error: "Invalid credentials" });

    if (passwordHash !== user.password) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await sessions.insertOne({
      userId: user._id,
      token,
      expiresAt,
      createdAt: new Date(),
    });

    return res.json({
      ok: true,
      token,
      user: { id: user._id.toString(), email: user.email, role: user.role },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Login failed" });
  }
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.post("/api/logout", requireAuth, async (req, res) => {
  try {
    const { sessions } = await getCollections();
    await sessions.deleteOne({ token: req.token });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Logout failed" });
  }
});

app.get("/api/files", requireAuth, async (req, res) => {
  try {
    const prefix = normalizeKey(req.query.prefix || "");
    const { files: filesCollection } = await getCollections();
    const regex = new RegExp(`^${escapeRegex(prefix)}`);
    const rows = await filesCollection
      .find({ filePath: regex })
      .sort({ filePath: 1 })
      .toArray();
    const files = (rows || []).filter((file) => {
      const key = String(file.filePath);
      if (!key.startsWith(prefix)) return false;
      const relative = key.slice(prefix.length);
      if (!relative) return false;
      const slashCount = (relative.match(/\//g) || []).length;
      if (slashCount === 0) return true;
      return slashCount === 1 && relative.endsWith("/");
    }).map((file) => ({
      key: file.filePath,
      size: file.size || 0,
      lastModified: file.updatedAt ? new Date(file.updatedAt).toISOString() : new Date().toISOString(),
    }));
    res.json({ ok: true, files });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to list files",
    });
  }
});

app.get("/api/files/download", requireAuth, async (req, res) => {
  try {
    const key = normalizeKey(req.query.key);
    if (!key) return res.status(400).json({ ok: false, error: "Missing key" });

    const url = await getS3DownloadUrl(key);
    res.json({ ok: true, url });
  } catch (error) {
    res.status(404).json({
      ok: false,
      error: error instanceof Error ? error.message : "File not found",
    });
  }
});

app.post("/api/files/upload", requireAuth, async (req, res) => {
  try {
    const { key, content, contentType } = req.body || {};
    const safeKey = normalizeKey(key);
    if (!safeKey || !content) {
      return res.status(400).json({ ok: false, error: "Missing key or content" });
    }

    const buffer = Buffer.from(content, "base64");
    await uploadS3Object(safeKey, buffer, contentType);

    const { files: filesCollection } = await getCollections();
    const fileName = path.basename(safeKey);
    await filesCollection.updateOne(
      { filePath: safeKey },
      {
        $set: {
          userId: new ObjectId(req.user.id),
          filePath: safeKey,
          fileName,
          size: buffer.length,
          isFolder: false,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    await logFileAction("upload", safeKey, fileName, req.user.id, {
      contentType: contentType || null,
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Upload failed",
    });
  }
});

app.post("/api/folders", requireAuth, async (req, res) => {
  try {
    const { key } = req.body || {};
    const safeKey = normalizeKey(key);
    if (!safeKey) {
      return res.status(400).json({ ok: false, error: "Missing folder key" });
    }
    const folderKey = safeKey.endsWith("/") ? safeKey : `${safeKey}/`;

    await createS3Folder(folderKey);

    const { files: filesCollection } = await getCollections();
    const folderName = path.basename(folderKey.replace(/\/$/, ""));
    await filesCollection.updateOne(
      { filePath: folderKey },
      {
        $set: {
          userId: new ObjectId(req.user.id),
          filePath: folderKey,
          fileName: folderName,
          size: 0,
          isFolder: true,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    await logFileAction("folder_create", folderKey, folderName, req.user.id);

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Create folder failed",
    });
  }
});

app.post("/api/files/copy", requireAuth, async (req, res) => {
  try {
    const { sourceKey, destinationKey } = req.body || {};
    const safeSource = normalizeKey(sourceKey);
    const safeDestination = normalizeKey(destinationKey);

    if (!safeSource || !safeDestination) {
      return res.status(400).json({ ok: false, error: "Missing source or destination" });
    }

    const { files: filesCollection } = await getCollections();

    if (safeSource.endsWith("/")) {
      const sourcePrefix = safeSource;
      const destPrefix = safeDestination.endsWith("/") ? safeDestination : `${safeDestination}/`;
      await createS3Folder(destPrefix);
      await copyS3Prefix(sourcePrefix, destPrefix);

      await filesCollection.updateOne(
        { filePath: destPrefix },
        {
          $set: {
            userId: new ObjectId(req.user.id),
            filePath: destPrefix,
            fileName: path.basename(destPrefix.replace(/\/$/, "")),
            size: 0,
            isFolder: true,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );

      const sourceFiles = await filesCollection
        .find({ filePath: new RegExp(`^${escapeRegex(sourcePrefix)}`) })
        .toArray();

      const updates = sourceFiles.map((file) => {
        const relative = String(file.filePath).slice(sourcePrefix.length);
        const newPath = `${destPrefix}${relative}`;
        const fileName = file.fileName || path.basename(newPath.replace(/\/$/, ""));
        return filesCollection.updateOne(
          { filePath: newPath },
          {
            $set: {
              userId: new ObjectId(req.user.id),
              filePath: newPath,
              fileName,
              size: file.size || 0,
              isFolder: Boolean(file.isFolder || newPath.endsWith("/")),
              updatedAt: new Date(),
            },
          },
          { upsert: true }
        );
      });

      await Promise.all(updates);
    } else {
      await copyS3Object(safeSource, safeDestination);
      const fileName = path.basename(safeDestination);
      const sourceDoc = await filesCollection.findOne({ filePath: safeSource });
      await filesCollection.updateOne(
        { filePath: safeDestination },
        {
          $set: {
            userId: new ObjectId(req.user.id),
            filePath: safeDestination,
            fileName,
            size: sourceDoc?.size || 0,
            isFolder: false,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }

    await logFileAction("copy", safeSource, path.basename(safeSource.replace(/\/$/, "")), req.user.id, {
      destination: safeDestination,
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Copy failed",
    });
  }
});

app.delete("/api/files", requireAuth, async (req, res) => {
  try {
    const key = normalizeKey(req.query.key);
    if (!key) return res.status(400).json({ ok: false, error: "Missing key" });

    if (key.endsWith("/")) {
      await deleteS3Prefix(key);
      const { files: filesCollection } = await getCollections();
      await filesCollection.deleteMany({ filePath: new RegExp(`^${escapeRegex(key)}`) });
      await logFileAction("folder_delete", key, path.basename(key.replace(/\/$/, "")), req.user.id);
    } else {
      await deleteS3Object(key);
      const { files: filesCollection } = await getCollections();
      await filesCollection.deleteOne({ filePath: key });
      await logFileAction("delete", key, path.basename(key), req.user.id);
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Delete failed",
    });
  }
});

app.get("/api/admin/users", requireAdmin, async (_req, res) => {
  try {
    const { users } = await getCollections();
    const rows = await users.find({}).sort({ createdAt: -1 }).toArray();
    const mapped = rows.map((user) => ({
      id: user._id.toString(),
      email: user.email,
      full_name: user.fullName || null,
      role: user.role,
      created_at: user.createdAt ? new Date(user.createdAt).toISOString() : new Date().toISOString(),
    }));
    res.json({ ok: true, users: mapped });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Failed to load users" });
  }
});

app.post("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const { email, password, fullName } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email and password are required" });
    }

    const passwordHash = crypto.createHash("md5").update(password).digest("hex");
    const { users } = await getCollections();
    await users.insertOne({
      email,
      password: passwordHash,
      fullName: fullName || null,
      role: "admin",
      createdAt: new Date(),
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Failed to create user" });
  }
});

app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ ok: false, error: "Invalid user id" });

    const { sessions, files, users } = await getCollections();
    const objectId = new ObjectId(userId);
    await sessions.deleteMany({ userId: objectId });
    await files.deleteMany({ userId: objectId });
    await users.deleteOne({ _id: objectId });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Failed to delete user" });
  }
});

app.get("/api/admin/logs", requireAdmin, async (_req, res) => {
  try {
    const { logs, users } = await getCollections();
    const rows = await logs.find({}).sort({ createdAt: -1 }).limit(50).toArray();
    const userIds = rows
      .map((log) => log.userId)
      .filter(Boolean)
      .map((id) => id.toString());
    const userDocs = await users
      .find({ _id: { $in: userIds.map((id) => new ObjectId(id)) } })
      .toArray();
    const userMap = new Map(userDocs.map((user) => [user._id.toString(), user.email]));

    const mapped = rows.map((log) => ({
      id: log._id.toString(),
      action: log.action,
      file_path: log.filePath,
      file_name: log.fileName || null,
      created_at: log.createdAt ? new Date(log.createdAt).toISOString() : new Date().toISOString(),
      user_email: log.userId ? userMap.get(log.userId.toString()) || null : null,
    }));
    res.json({ ok: true, logs: mapped });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Failed to load logs" });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API server running on http://localhost:${PORT}`);
});
