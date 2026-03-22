/**
 * Seed script for Round 4 (Visual Puzzle – Part A)
 *
 * Each puzzle contains 2 images that together hint at a hidden word (rebus-style).
 * Images are read from:  frontend/public/Round4/{order}.1.jpeg, {order}.2.jpeg (etc.)
 * Answers are read from: scripts/round4.json (keys "1" through "7")
 *
 * Uploads images to Cloudinary (folder: round4) instead of Supabase storage.
 *
 * Usage:
 *   node scripts/seedRound4.js
 *
 * Required env (frontend/.env.local or frontend/.env):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 */

const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

const ENV_CANDIDATES = [
  path.resolve(__dirname, "../.env.local"),
  path.resolve(__dirname, "../.env"),
  path.resolve(process.cwd(), ".env.local"),
  path.resolve(process.cwd(), ".env"),
];

for (const envPath of ENV_CANDIDATES) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

const { createClient } = require("@supabase/supabase-js");
const cloudinary = require("cloudinary").v2;
const sharp = require("sharp");
const os = require("os");
const util = require("util");
const round4Data = require("./round4.json");

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB — Cloudinary free plan limit

// ─── Supabase (DB only) ──────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  if (process.env.NODE_ENV !== "test") process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL || "http://localhost:54321",
  SERVICE_ROLE_KEY || "mock",
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ─── Cloudinary configuration ────────────────────────────────────────────────
const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  console.error("❌  Missing Cloudinary env vars (NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)");
  if (process.env.NODE_ENV !== "test") process.exit(1);
}

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: API_KEY,
  api_secret: API_SECRET,
});

const CLOUDINARY_FOLDER = "round4";
const IMAGES_DIR = path.join(__dirname, "../public/Round4");

function formatCloudinaryError(err) {
  const message =
    err?.error?.message ||
    err?.message ||
    err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    "Unknown Cloudinary error";

  return {
    message,
    name: err?.name,
    http_code: err?.http_code || err?.error?.http_code || err?.response?.status,
    code: err?.code,
    raw: util.inspect(err, { depth: 6, colors: false, breakLength: 140 }),
  };
}

function isCloudinaryTimeoutError(err) {
  const httpCode = err?.http_code || err?.error?.http_code || err?.response?.status;
  const msg = String(
    err?.error?.message || err?.message || err?.response?.data?.error?.message || "",
  ).toLowerCase();
  return httpCode === 499 || msg.includes("timeout") || msg.includes("timed out");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function detectQuestionOrderColumn() {
  for (const column of ["order", "question_order"]) {
    const { error } = await supabase
      .from("questions")
      .select(`id, ${column}`)
      .limit(1);
    if (!error) return column;
  }

  throw new Error(
    "Could not detect question order column in questions table (expected 'order' or 'question_order').",
  );
}

function toPublicRound4Path(filePath) {
  if (!filePath) return null;
  return `/Round4/${path.basename(filePath)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Puzzle data
// ─────────────────────────────────────────────────────────────────────────────

function generateImageLabels(answer) {
  const mid = Math.ceil(answer.length / 2);
  return [answer.slice(0, mid), answer.slice(mid)];
}

// Build puzzles array from round4.json (questions 1-7)
const round4Puzzles = [];
for (let order = 1; order <= 7; order++) {
  const answer = round4Data[String(order)];
  if (typeof answer !== "string" || !answer.trim()) {
    console.warn(`⚠️  Missing/invalid answer for order ${order} in round4.json; skipping.`);
    continue;
  }

  const image_labels = generateImageLabels(answer);

  const localImg1 = `/Round4/${order}-1.png`;
  const localImg2 = `/Round4/${order}-2.png`;

  round4Puzzles.push({
    order,
    image_labels,
    answer,
    points: 100,
    // Frontend can render these directly if Cloudinary upload is skipped/fails.
    image_urls: [localImg1, localImg2],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloudinary helpers
// ─────────────────────────────────────────────────────────────────────────────
async function ensureCloudinaryFolder() {
  try {
    await cloudinary.api.create_folder(CLOUDINARY_FOLDER);
    console.log(`📁 Cloudinary folder '${CLOUDINARY_FOLDER}' ready.`);
  } catch (err) {
    if (err?.error?.message?.includes("already exists")) {
      console.log(`📁 Cloudinary folder '${CLOUDINARY_FOLDER}' already exists.`);
    } else {
      const formatted = formatCloudinaryError(err);
      console.error(`❌ Cloudinary folder check failed for '${CLOUDINARY_FOLDER}': ${formatted.message}`);
      console.error(`   name=${formatted.name || "n/a"} http_code=${formatted.http_code || "n/a"} code=${formatted.code || "n/a"}`);
      console.error(`   raw=${formatted.raw}`);
      throw err;
    }
  }
}

async function compressIfNeeded(filePath, fileName) {
  const stats = fs.statSync(filePath);
  if (stats.size <= MAX_FILE_SIZE) return filePath;

  console.log(`   🗜️  Compressing ${fileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB > 10 MB limit)...`);
  const tempPath = path.join(os.tmpdir(), `compressed_${Date.now()}_${path.parse(fileName).name}.jpg`);
  await sharp(filePath)
    .resize({ width: 1920, withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(tempPath);
  const newStats = fs.statSync(tempPath);
  console.log(`   🗜️  Compressed to ${(newStats.size / 1024 / 1024).toFixed(2)} MB`);
  return tempPath;
}

/**
 * Find a local image file for a given puzzle order and image index (1 or 2).
 * Tries patterns like: {order}.{index}.jpeg, {order}.{index}.png, {order}.{index}.jpg,
 *                       {order}-{index}.png, {order}-{index}.jpeg, etc.
 */
function findLocalImage(order, imageIndex) {
  if (!fs.existsSync(IMAGES_DIR)) return null;
  const files = fs.readdirSync(IMAGES_DIR);

  // Try dotted pattern first (1.1.jpeg, 1.2.jpeg)
  const dotPrefix = `${order}.${imageIndex}.`;
  const dotMatch = files.find(f => f.startsWith(dotPrefix));
  if (dotMatch) return path.join(IMAGES_DIR, dotMatch);

  // Try dashed pattern (1-1.png, 1-2.png)
  const dashPrefix = `${order}-${imageIndex}.`;
  const dashMatch = files.find(f => f.startsWith(dashPrefix));
  if (dashMatch) return path.join(IMAGES_DIR, dashMatch);

  return null;
}

/**
 * Upload a specific image file to Cloudinary.
 * Returns the secure URL, or null if upload failed or file not found.
 */
async function uploadImage(filePath, publicId) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.log(`   ℹ️   File not found: ${filePath}`);
    return null;
  }

  const filename = path.basename(filePath);
  console.log(`   📤  Uploading ${filename} to Cloudinary...`);

  let uploadPath = filePath;
  try {
    uploadPath = await compressIfNeeded(filePath, filename);

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await cloudinary.uploader.upload(uploadPath, {
          folder: CLOUDINARY_FOLDER,
          public_id: path.basename(publicId),
          overwrite: true,
          resource_type: "auto",
          timeout: 180000,
        });
        console.log(`   ✅  Uploaded: ${result.secure_url}`);
        return result.secure_url;
      } catch (err) {
        const formatted = formatCloudinaryError(err);
        const isTimeout = isCloudinaryTimeoutError(err);
        console.error(`   ❌  Upload failed for ${filename} (attempt ${attempt}/${maxAttempts}): ${formatted.message}`);
        console.error(`      name=${formatted.name || "n/a"} http_code=${formatted.http_code || "n/a"} code=${formatted.code || "n/a"}`);
        console.error(`      raw=${formatted.raw}`);

        if (!isTimeout || attempt === maxAttempts) {
          return null;
        }

        const waitMs = 1000 * Math.pow(2, attempt - 1);
        console.log(`      ↻  Timeout detected, retrying in ${waitMs}ms...`);
        await sleep(waitMs);
      }
    }

    return null;
  } catch (err) {
    const formatted = formatCloudinaryError(err);
    console.error(`   ❌  Upload preparation failed for ${filename}: ${formatted.message}`);
    console.error(`      name=${formatted.name || "n/a"} http_code=${formatted.http_code || "n/a"} code=${formatted.code || "n/a"}`);
    console.error(`      raw=${formatted.raw}`);
    return null;
  } finally {
    if (uploadPath !== filePath && fs.existsSync(uploadPath)) {
      fs.unlinkSync(uploadPath);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main seed
// ─────────────────────────────────────────────────────────────────────────────
async function seed() {
  console.log("🚀  Seeding Round 4 (Visual Puzzle) questions…");
  console.log("☁️   Using Cloudinary for image storage\n");

  const orderColumn = await detectQuestionOrderColumn();
  console.log(`🧭  Using order column: ${orderColumn}`);

  await ensureCloudinaryFolder();

  // Clear only Part A rows so this script does not delete Part B (orders 8-10)
  const partAOrders = round4Puzzles.map((p) => p.order);
  console.log(`🗑️   Clearing existing round-4 Part A rows (orders: ${partAOrders.join(", ")})…`);
  const { data: existingRows, error: fetchErr } = await supabase
    .from("questions")
    .select(`id, ${orderColumn}`)
    .eq("round_id", "4");

  if (fetchErr) {
    console.error("❌  Failed to fetch existing Part A rows:", fetchErr.message);
    return;
  }

  const idsToDelete = (existingRows || [])
    .filter((row) => partAOrders.includes(Number(row[orderColumn])))
    .map((row) => row.id);

  if (idsToDelete.length > 0) {
    for (const id of idsToDelete) {
      const { error: delErr } = await supabase
        .from("questions")
        .delete()
        .eq("id", id);
      if (delErr) {
        console.error("❌  Failed to delete existing Part A row:", delErr.message);
        return;
      }
    }
    console.log(`   Cleared ${idsToDelete.length} old Part A row(s)\n`);
  } else {
    console.log("   No existing Part A rows to clear\n");
  }

  for (const puzzle of round4Puzzles) {
    console.log(
      `📦  Puzzle ${puzzle.order}: ${puzzle.image_labels.join(" + ")} → ${puzzle.answer}`,
    );

    const finalUrls = [...puzzle.image_urls];

    // Upload each local image (2 per puzzle) to Cloudinary
    for (let i = 0; i < 2; i++) {
      const localFile = findLocalImage(puzzle.order, i + 1);

      // Keep a frontend-safe local path as fallback even if upload fails.
      const localPublicPath = toPublicRound4Path(localFile);
      if (localPublicPath) {
        finalUrls[i] = localPublicPath;
      }

      const publicId = `${CLOUDINARY_FOLDER}/q${puzzle.order}_img${i + 1}`;
      const url = await uploadImage(localFile, publicId);
      if (url) {
        finalUrls[i] = url;
      }
    }

    // Insert fresh row
    const row = {
      round_id: "4",
      [orderColumn]: puzzle.order,
      image_urls: finalUrls,
      letters: puzzle.image_labels,
      answer: puzzle.answer,
      correct_index: 0,
      points: puzzle.points,
    };

    const { error: insertError } = await supabase.from("questions").insert(row);

    if (insertError) {
      console.error(
        `   ❌  DB insert failed for puzzle ${puzzle.order}:`,
        insertError.message,
      );
    } else {
      console.log(`   ✅  Seeded puzzle ${puzzle.order} (${puzzle.answer})\n`);
    }
  }

  console.log("🎉  Done seeding Round 4!");
}

if (require.main === module) {
  seed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { round4Puzzles, seed };
