/**
 * Seed script for Round 4 (Video MCQ – Part B)
 *
 * Reads question data from scripts/round4.json (keys "8" through "10").
 *
 * round4.json shape for each MCQ key:
 * {
 *   "Options": ["A. ...", "B. ...", "C. ...", "D. ..."],
 *   "Answer": "A",
 *   "Hints": ["Hint1: ...", "Hint2: ..."]
 * }
 *
 * If video_url starts with http, it is used directly.
 * Otherwise, it tries to upload from frontend/public/Round4/{filename} to Cloudinary.
 *
 * Usage:
 *   node scripts/seedRound4PartB.js
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
const util = require("util");
const round4Data = require("./round4.json");

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

function letterToIndex(letter) {
  const normalized = String(letter || "").trim().toUpperCase();
  return ["A", "B", "C", "D"].indexOf(normalized);
}

function stripOptionPrefix(optionText) {
  return String(optionText || "").replace(/^[A-D]\.?\s*/i, "").trim();
}

function toPublicRound4Path(fileName) {
  if (!fileName) return null;
  return `/Round4/${path.basename(fileName)}`;
}

function buildPartBQuestionsFromRound4Json() {
  const questions = [];

  for (let order = 8; order <= 10; order++) {
    const raw = round4Data[String(order)];
    if (!raw || typeof raw !== "object") {
      console.warn(`⚠️ Missing MCQ object for order ${order} in round4.json; skipping.`);
      continue;
    }

    const options = Array.isArray(raw.Options)
      ? raw.Options.map(stripOptionPrefix)
      : [];
    const correctIndex = letterToIndex(raw.Answer);
    const hints = Array.isArray(raw.Hints) ? raw.Hints.map((h) => String(h || "").trim()) : [];

    if (options.length !== 4 || correctIndex < 0) {
      console.warn(`⚠️ Invalid options/answer for order ${order} in round4.json; skipping.`);
      continue;
    }

    questions.push({
      order,
      question: "What happens next in this scene?",
      options,
      correct_index: correctIndex,
      hint: hints.join("\n"),
      hint_cost: 100,
      points: 100,
      video_url: `${order}.mp4`,
    });
  }

  return questions;
}

// ─── Cloudinary helpers ──────────────────────────────────────────────────────
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

async function uploadVideo(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`   ℹ️ Local file not found: ${filePath}`);
    return null;
  }
  const filename = path.basename(filePath);
  const publicId = `${CLOUDINARY_FOLDER}/v_${path.parse(filename).name}`;

  console.log(`   📤 Uploading ${filename} to Cloudinary...`);
  try {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await cloudinary.uploader.upload(filePath, {
          folder: CLOUDINARY_FOLDER,
          public_id: path.parse(filename).name,
          overwrite: true,
          resource_type: "video",
          timeout: 300000,
          chunk_size: 6000000,
        });
        console.log(`   ✅ Uploaded: ${result.secure_url}`);
        return result.secure_url;
      } catch (err) {
        const formatted = formatCloudinaryError(err);
        const isTimeout = isCloudinaryTimeoutError(err);
        console.error(`   ❌ Upload failed for ${filename} (attempt ${attempt}/${maxAttempts}): ${formatted.message}`);
        console.error(`      name=${formatted.name || "n/a"} http_code=${formatted.http_code || "n/a"} code=${formatted.code || "n/a"}`);
        console.error(`      raw=${formatted.raw}`);

        if (!isTimeout || attempt === maxAttempts) {
          return null;
        }

        const waitMs = 1000 * Math.pow(2, attempt - 1);
        console.log(`      ↻ Timeout detected, retrying in ${waitMs}ms...`);
        await sleep(waitMs);
      }
    }

    return null;
  } catch (err) {
    const formatted = formatCloudinaryError(err);
    console.error(`   ❌ Upload setup failed for ${filename}: ${formatted.message}`);
    console.error(`      name=${formatted.name || "n/a"} http_code=${formatted.http_code || "n/a"} code=${formatted.code || "n/a"}`);
    console.error(`      raw=${formatted.raw}`);
    return null;
  }
}

async function seed() {
  console.log("🚀 Seeding Round 4 (Video MCQ) questions…");
  console.log("☁️  Using Cloudinary for video storage\n");

  const orderColumn = await detectQuestionOrderColumn();
  console.log(`🧭  Using order column: ${orderColumn}`);

  const questionsData = buildPartBQuestionsFromRound4Json();
  if (questionsData.length === 0) {
    console.error("❌ No valid Round 4 Part B questions were built from round4.json.");
    return;
  }

  await ensureCloudinaryFolder();

  const ordersToSeed = questionsData.map((p) => p.order);
  console.log(
    `🗑️ Clearing existing round-4 Part B questions (orders: ${ordersToSeed.join(", ")})…`,
  );
  const { data: existingRows, error: fetchErr } = await supabase
    .from("questions")
    .select(`id, ${orderColumn}`)
    .eq("round_id", "4");

  if (fetchErr) {
    console.error("❌ Failed to fetch existing Part B rows:", fetchErr.message);
    return;
  }

  const idsToDelete = (existingRows || [])
    .filter((row) => ordersToSeed.includes(Number(row[orderColumn])))
    .map((row) => row.id);

  if (idsToDelete.length > 0) {
    for (const id of idsToDelete) {
      const { error: delErr } = await supabase
        .from("questions")
        .delete()
        .eq("id", id);
      if (delErr) {
        console.error("❌ Failed to delete existing Part B row:", delErr.message);
        return;
      }
    }
    console.log(`   Cleared ${idsToDelete.length} old Part B row(s)`);
  } else {
    console.log("   No existing Part B rows to clear");
  }

  for (const p of questionsData) {
    console.log(`📦 Question ${p.order}: ${p.question}`);

    const originalVideoRef = p.video_url;
    let finalVideoUrl = originalVideoRef;

    // If it's not a direct URL, try to upload from local public/Round4
    if (finalVideoUrl && !finalVideoUrl.startsWith("http")) {
      const localPublicPath = toPublicRound4Path(finalVideoUrl);
      if (localPublicPath) {
        finalVideoUrl = localPublicPath;
      }

      const filePath = path.join(VIDEOS_DIR, path.basename(originalVideoRef));
      const uploadedUrl = await uploadVideo(filePath);
      if (uploadedUrl) {
        finalVideoUrl = uploadedUrl;
      }
    }

    const row = {
      round_id: "4",
      [orderColumn]: p.order,
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

if (require.main === module) {
  seed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seed, buildPartBQuestionsFromRound4Json };
