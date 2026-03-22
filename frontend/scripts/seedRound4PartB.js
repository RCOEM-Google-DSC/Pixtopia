/**
 * Seed script for Round 4 (Video MCQ – Part B)
 *
 * Reads question data from lib/round4PartBQuestions.json.
 * If video_url starts with http, it is used directly.
 * Otherwise, it tries to upload from frontend/public/Round4/{filename} to Cloudinary.
 *
 * Usage:
 *   node scripts/seedRound4PartB.js
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { createClient } = require("@supabase/supabase-js");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const questionsData = require("../lib/round4PartBQuestions.json");

// ─── Supabase (DB only) ──────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Cloudinary configuration ────────────────────────────────────────────────
const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  console.error("❌ Missing Cloudinary env vars (NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)");
  process.exit(1);
}

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: API_KEY,
  api_secret: API_SECRET,
});

const CLOUDINARY_FOLDER = "round4";
const VIDEOS_DIR = path.join(__dirname, "../public/Round4");

// ─── Cloudinary helpers ──────────────────────────────────────────────────────
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

async function uploadVideo(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`   ℹ️ Local file not found: ${filePath}`);
    return null;
  }
  const filename = path.basename(filePath);
  const publicId = `${CLOUDINARY_FOLDER}/v_${path.parse(filename).name}`;

  console.log(`   📤 Uploading ${filename} to Cloudinary...`);
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      public_id: publicId,
      overwrite: true,
      resource_type: "video",
    });
    console.log(`   ✅ Uploaded: ${result.secure_url}`);
    return result.secure_url;
  } catch (err) {
    console.error(`   ❌ Upload failed for ${filename}:`, err.message);
    return null;
  }
}

async function seed() {
  console.log("🚀 Seeding Round 4 (Video MCQ) questions…");
  console.log("☁️  Using Cloudinary for video storage\n");

  await ensureCloudinaryFolder();

  const ordersToSeed = questionsData.map((p) => p.order);
  console.log(
    `🗑️ Clearing existing round-4 Part B questions (orders: ${ordersToSeed.join(", ")})…`,
  );
  await supabase
    .from("questions")
    .delete()
    .eq("round_id", "4")
    .in("order", ordersToSeed);

  for (const p of questionsData) {
    console.log(`📦 Question ${p.order}: ${p.question}`);

    let finalVideoUrl = p.video_url;

    // If it's not a direct URL, try to upload from local public/Round4
    if (finalVideoUrl && !finalVideoUrl.startsWith("http")) {
      const filePath = path.join(VIDEOS_DIR, finalVideoUrl);
      const uploadedUrl = await uploadVideo(filePath);
      if (uploadedUrl) {
        finalVideoUrl = uploadedUrl;
      } else {
        finalVideoUrl = `https://placeholder.com/${p.video_url}`;
      }
    }

    const row = {
      round_id: "4",
      order: p.order,
      question: p.question,
      video_url: finalVideoUrl,
      options: p.options,
      correct_index: p.correct_index,
      hint: p.hint,
      hint_cost: p.hint_cost,
      points: p.points,
    };

    const { error: insertError } = await supabase.from("questions").insert(row);
    if (insertError) {
      console.error(
        `   ❌ DB insert failed for question ${p.order}:`,
        insertError.message,
      );
    } else {
      console.log(`   ✅ Seeded question ${p.order}\n`);
    }
  }
  console.log("🎉 Done seeding Round 4 Part B!");
}

seed().catch(console.error);
