/**
 * Seed script for Round 4 (Video MCQ – Part B)
 *
 * Reads question data from lib/round4PartBQuestions.json.
 * If video_url starts with http, it is used directly.
 * Otherwise, it tries to upload from frontend/public/round4/{filename}.
 *
 * Usage:
 *   node scripts/seedRound4PartB.js
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const questionsData = require("../lib/round4PartBQuestions.json");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET_NAME = "round4";
const VIDEOS_DIR = path.join(__dirname, "../public/round4");

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.find((b) => b.name === BUCKET_NAME)) {
    console.log(`🪣 Creating public bucket '${BUCKET_NAME}'…`);
    await supabase.storage.createBucket(BUCKET_NAME, { public: true });
  }
}

async function uploadVideo(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`   ℹ️ Local file not found: ${filePath}`);
    return null;
  }
  const filename = path.basename(filePath);
  const storageName = `v_${Date.now()}_${filename}`;
  console.log(`   📤 Uploading ${filename}…`);
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storageName, fs.readFileSync(filePath), {
      contentType: "video/mp4",
      upsert: true,
    });
  if (error) {
    console.error(`   ❌ Upload failed: ${error.message}`);
    return null;
  }
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(storageName);
  return urlData.publicUrl;
}

async function seed() {
  console.log("🚀 Seeding Round 4 (Video MCQ) questions…\n");
  await ensureBucket();

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

    // If it's not a direct URL, try to upload from local public/round4
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
