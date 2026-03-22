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
 * Required env (frontend/.env):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { createClient } = require("@supabase/supabase-js");
const cloudinary = require("cloudinary").v2;
const sharp = require("sharp");
const fs = require("fs");
const os = require("os");
const round4Answers = require("./round4.json");

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

// Placeholder service used when local images are absent
const PLACEHOLDER = (w, h, label) =>
  `https://placehold.co/${w}x${h}/1e1e2e/6366f1?text=${encodeURIComponent(label)}`;

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
  const answer = round4Answers[String(order)];
  const image_labels = generateImageLabels(answer);
  round4Puzzles.push({
    order,
    image_labels,
    answer,
    points: 100,
    image_urls: [PLACEHOLDER(400, 300, image_labels[0]), PLACEHOLDER(400, 300, image_labels[1])],
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
      console.log(`📁 Cloudinary folder '${CLOUDINARY_FOLDER}' created or already exists.`);
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

    const result = await cloudinary.uploader.upload(uploadPath, {
      public_id: publicId,
      overwrite: true,
      resource_type: "image",
    });
    console.log(`   ✅  Uploaded: ${result.secure_url}`);
    return result.secure_url;
  } catch (err) {
    console.error(`   ❌  Upload failed for ${filename}:`, err.message);
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

  await ensureCloudinaryFolder();

  // Wipe all existing round-4 rows first
  console.log("🗑️   Clearing all existing round-4 questions…");
  const { data: allExisting } = await supabase
    .from("questions")
    .select("id")
    .eq("round_id", "4");
  if (allExisting && allExisting.length > 0) {
    for (const r of allExisting) {
      await supabase.from("questions").delete().eq("id", r.id);
    }
    console.log(`   Deleted ${allExisting.length} old row(s)\n`);
  }

  for (const puzzle of round4Puzzles) {
    console.log(
      `📦  Puzzle ${puzzle.order}: ${puzzle.image_labels.join(" + ")} → ${puzzle.answer}`,
    );

    const finalUrls = [...puzzle.image_urls];

    // Upload each local image (2 per puzzle) to Cloudinary
    for (let i = 0; i < 2; i++) {
      const localFile = findLocalImage(puzzle.order, i + 1);
      const publicId = `${CLOUDINARY_FOLDER}/q${puzzle.order}_img${i + 1}`;
      const url = await uploadImage(localFile, publicId);
      if (url) {
        finalUrls[i] = url;
      }
    }

    // Insert fresh row
    const row = {
      round_id: "4",
      order: puzzle.order,
      image_urls: finalUrls,
      answer: puzzle.answer,
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
