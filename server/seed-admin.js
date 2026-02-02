import dotenv from "dotenv";
import crypto from "crypto";
import { getDb } from "./db.js";

dotenv.config();

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const fullName = process.env.ADMIN_NAME || null;
const role = "admin";

if (!email || !password) {
  // eslint-disable-next-line no-console
  console.log("Missing ADMIN_EMAIL or ADMIN_PASSWORD in .env");
  process.exit(1);
}

try {
  const db = await getDb();
  const users = db.collection("users");
  const passwordHash = crypto.createHash("md5").update(password).digest("hex");
  const existing = await users.findOne({ email });

  if (existing) {
    await users.updateOne(
      { _id: existing._id },
      { $set: { password: passwordHash, fullName, role } }
    );
    // eslint-disable-next-line no-console
    console.log(`Updated admin user: ${email}`);
  } else {
    await users.insertOne({
      email,
      password: passwordHash,
      fullName,
      role,
      createdAt: new Date(),
    });
    // eslint-disable-next-line no-console
    console.log(`Created admin user: ${email}`);
  }
} catch (error) {
  // eslint-disable-next-line no-console
  console.error("Failed to seed admin user:", error);
  process.exit(1);
}
