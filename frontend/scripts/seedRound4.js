/**
 * Seed script for Round 4 (Visual Puzzle – Part A)
 *
 * Each puzzle contains 2 images that together hint at a hidden word (rebus-style).
 * Images are read from:  frontend/public/round4/{order}.{1|2}.{png|jpg|webp}
 * If a local file is not found, the placeholder URL in the data below is kept.
 *
 * Usage:
 *   node scripts/seedRound4.js
 *
 * Required env (frontend/.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

require("dotenv").config({ path: "../.env.local" });
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  if (process.env.NODE_ENV !== "test") process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL || "http://localhost:54321",
  SERVICE_ROLE_KEY || "mock",
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const BUCKET_NAME = "round4";
const IMAGES_DIR = path.join(__dirname, "../public/round4");
// Placeholder service used when local images are absent
const PLACEHOLDER = (w, h, label) =>
  `https://placehold.co/${w}x${h}/1e1e2e/6366f1?text=${encodeURIComponent(label)}`;

// ─────────────────────────────────────────────────────────────────────────────
// Puzzle data  (Pixar rebus theme)
//
// Each puzzle: two images that together spell / imply `answer`.
// order   – question order (maps to ?order= param in the API)
// image_labels – human labels used for placeholder URLs
// answer  – the hidden word participants must guess (UPPER-CASE recommended)
// ─────────────────────────────────────────────────────────────────────────────
const round4Puzzles = [
  {
    order: 1,
    image_labels: ["Mc", "Queen"], 
    answer: "McQueen",
    hint: "cars character",
    points: 100,
    localFiles: ["cars.jpg", "cars2.png"],
    image_urls: [
      PLACEHOLDER(400, 300, "Mc"),
      PLACEHOLDER(400, 300, "Queen"),
    ],
  },
  {
    order: 2,
    image_labels: ["Woo", "dy"], 
    answer: "Woody",
    hint: "Toy story character",
    points: 100,
    localFiles: ["toys.jpg", "toys2.webp"],
    image_urls: [
      PLACEHOLDER(400, 300, "Woo"),
      PLACEHOLDER(400, 300, "dy"),
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Storage helpers
// ─────────────────────────────────────────────────────────────────────────────
async function ensureBucket() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) {
    console.error("❌  listBuckets:", error.message);
    return;
  }

  if (!buckets?.find((b) => b.name === BUCKET_NAME)) {
    console.log(`🪣  Creating public bucket '${BUCKET_NAME}'…`);
    const { error: createErr } = await supabase.storage.createBucket(
      BUCKET_NAME,
      { public: true },
    );
    if (createErr) console.error("❌  createBucket:", createErr.message);
  }
}

/**
 * Upload a specific image file to storage
 * Returns the public URL, or null if upload failed or file not found.
 */
async function uploadImage(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`   ℹ️   File not found: ${filePath}`);
    return null;
  }

  const filename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  const contentType = mimeMap[ext] || "image/png";
  const storageName = `${Date.now()}_${filename}`;

  console.log(`   📤  Uploading ${filename}…`);
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storageName, fs.readFileSync(filePath), {
      contentType,
      upsert: true,
    });

  if (error) {
    console.error(`   ❌  Upload failed: ${error.message}`);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(storageName);
  return urlData.publicUrl;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main seed
// ─────────────────────────────────────────────────────────────────────────────
async function seed() {
  console.log("🚀  Seeding Round 4 (Visual Puzzle) questions…\n");

  await ensureBucket();

  for (const puzzle of round4Puzzles) {
    console.log(
      `📦  Puzzle ${puzzle.order}: ${puzzle.image_labels.join(" + ")} → ${puzzle.answer}`,
    );

    const finalUrls = [...puzzle.image_urls];

    // Upload each local image if it exists
    for (let i = 0; i < 2; i++) {
      const localFileName = puzzle.localFiles[i];
      const filePath = path.join(IMAGES_DIR, localFileName);
      const url = await uploadImage(filePath);
      if (url) {
        console.log(`   ✅  Image ${i + 1} uploaded: ${url}`);
        finalUrls[i] = url;
      }
    }

    // Delete any existing rows for this puzzle by UUID to avoid PostgREST misinterpreting
    // the `order` column name as the ORDER BY keyword in DELETE filter URLs.
    const { data: existingRows } = await supabase
      .from("questions")
      .select("id, order")
      .eq("round_id", "4");

    if (existingRows) {
      const toDelete = existingRows.filter((r) => r.order === puzzle.order);
      for (const r of toDelete) {
        await supabase.from("questions").delete().eq("id", r.id);
      }
      if (toDelete.length > 0) {
        console.log(`   🗑️   Deleted ${toDelete.length} existing row(s) for puzzle ${puzzle.order}`);
      }
    }

    // Insert the puzzle into the database
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
