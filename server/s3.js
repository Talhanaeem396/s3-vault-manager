import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";

dotenv.config();

const {
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_S3_BUCKET,
  AWS_S3_PREFIX = "",
} = process.env;

if (!AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_S3_BUCKET) {
  // eslint-disable-next-line no-console
  console.warn("Missing AWS S3 environment variables. S3 features will fail.");
}

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID || "",
    secretAccessKey: AWS_SECRET_ACCESS_KEY || "",
  },
});

const ensureS3Configured = () => {
  if (!AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_S3_BUCKET) {
    throw new Error("S3 is not configured. Check AWS_* environment variables.");
  }
};

const normalizePrefix = (prefix) => {
  if (!prefix) return "";
  return prefix.replace(/^\/+/, "").replace(/\/+$/, "") + "/";
};

const basePrefix = normalizePrefix(AWS_S3_PREFIX);

const buildKey = (key) => `${basePrefix}${key}`;

export async function listS3Objects(prefix) {
  ensureS3Configured();
  const command = new ListObjectsV2Command({
    Bucket: AWS_S3_BUCKET,
    Prefix: buildKey(prefix),
  });
  const result = await s3.send(command);
  const contents = result.Contents || [];
  return contents
    .filter((item) => item.Key)
    .map((item) => ({
      key: item.Key.replace(basePrefix, ""),
      size: item.Size || 0,
      lastModified: item.LastModified ? item.LastModified.toISOString() : null,
    }));
}

export async function uploadS3Object(key, buffer, contentType) {
  ensureS3Configured();
  const command = new PutObjectCommand({
    Bucket: AWS_S3_BUCKET,
    Key: buildKey(key),
    Body: buffer,
    ContentType: contentType || "application/octet-stream",
  });
  await s3.send(command);
}

export async function deleteS3Object(key) {
  ensureS3Configured();
  const command = new DeleteObjectCommand({
    Bucket: AWS_S3_BUCKET,
    Key: buildKey(key),
  });
  await s3.send(command);
}

export async function getS3DownloadUrl(key) {
  ensureS3Configured();
  const command = new GetObjectCommand({
    Bucket: AWS_S3_BUCKET,
    Key: buildKey(key),
  });
  return getSignedUrl(s3, command, { expiresIn: 60 * 5 });
}

export async function createS3Folder(key) {
  ensureS3Configured();
  const command = new PutObjectCommand({
    Bucket: AWS_S3_BUCKET,
    Key: buildKey(key),
    Body: "",
    ContentType: "application/x-directory",
  });
  await s3.send(command);
}

export async function deleteS3Prefix(prefix) {
  ensureS3Configured();
  let continuationToken;

  do {
    const listCommand = new ListObjectsV2Command({
      Bucket: AWS_S3_BUCKET,
      Prefix: buildKey(prefix),
      ContinuationToken: continuationToken,
    });
    const listResult = await s3.send(listCommand);
    const keys = (listResult.Contents || [])
      .map((item) => item.Key)
      .filter(Boolean);

    if (keys.length > 0) {
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: AWS_S3_BUCKET,
        Delete: {
          Objects: keys.map((Key) => ({ Key })),
          Quiet: true,
        },
      });
      await s3.send(deleteCommand);
    }

    continuationToken = listResult.IsTruncated ? listResult.NextContinuationToken : undefined;
  } while (continuationToken);
}

export async function copyS3Object(sourceKey, destinationKey) {
  ensureS3Configured();
  const command = new CopyObjectCommand({
    Bucket: AWS_S3_BUCKET,
    CopySource: `${AWS_S3_BUCKET}/${buildKey(sourceKey)}`,
    Key: buildKey(destinationKey),
  });
  await s3.send(command);
}

export async function copyS3Prefix(sourcePrefix, destinationPrefix) {
  ensureS3Configured();
  let continuationToken;

  do {
    const listCommand = new ListObjectsV2Command({
      Bucket: AWS_S3_BUCKET,
      Prefix: buildKey(sourcePrefix),
      ContinuationToken: continuationToken,
    });
    const listResult = await s3.send(listCommand);
    const contents = listResult.Contents || [];

    for (const item of contents) {
      if (!item.Key) continue;
      const relative = item.Key.replace(buildKey(sourcePrefix), "");
      const destKey = `${destinationPrefix}${relative}`;
      await copyS3Object(`${sourcePrefix}${relative}`, destKey);
    }

    continuationToken = listResult.IsTruncated ? listResult.NextContinuationToken : undefined;
  } while (continuationToken);
}
