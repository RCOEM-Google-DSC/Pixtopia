const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const cloudinary = require('cloudinary').v2;
const sharp = require('sharp');
const fs = require('fs');
const os = require('os');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB — Cloudinary free plan limit

// ─── Supabase (still used for DB operations) ─────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase environment variables.');
  if (process.env.NODE_ENV !== 'test') process.exit(1);
}

const supabase = createClient(SUPABASE_URL || 'http://localhost:54321', SERVICE_ROLE_KEY || 'mock', {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Cloudinary configuration ─────────────────────────────────────────────────
const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  console.error('❌ Missing Cloudinary environment variables (NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).');
  if (process.env.NODE_ENV !== 'test') process.exit(1);
}

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: API_KEY,
  api_secret: API_SECRET,
});

const CLOUDINARY_FOLDER = 'round3';
const ROUND3_DIR = path.join(__dirname, '../public/round3');

// ─── Ensure the Cloudinary folder exists ──────────────────────────────────────
async function ensureCloudinaryFolder() {
  try {
    await cloudinary.api.create_folder(CLOUDINARY_FOLDER);
    console.log(`📁 Cloudinary folder '${CLOUDINARY_FOLDER}' ready.`);
  } catch (err) {
    if (err?.error?.message?.includes('already exists')) {
      console.log(`📁 Cloudinary folder '${CLOUDINARY_FOLDER}' already exists.`);
    } else {
      console.log(`📁 Cloudinary folder '${CLOUDINARY_FOLDER}' created or already exists.`);
    }
  }
}

// ─── Compress image if it exceeds the size limit ──────────────────────────────
async function compressIfNeeded(filePath, fileName) {
  const stats = fs.statSync(filePath);
  if (stats.size <= MAX_FILE_SIZE) {
    return filePath; // No compression needed
  }

  console.log(`   🗜️  Compressing ${fileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB > 10 MB limit)...`);

  const tempPath = path.join(os.tmpdir(), `compressed_${Date.now()}_${path.parse(fileName).name}.jpg`);

  await sharp(filePath)
    .resize({ width: 1920, withoutEnlargement: true }) // cap width at 1920px
    .jpeg({ quality: 85 })
    .toFile(tempPath);

  const newStats = fs.statSync(tempPath);
  console.log(`   🗜️  Compressed to ${(newStats.size / 1024 / 1024).toFixed(2)} MB`);
  return tempPath;
}

// ─── Upload image to Cloudinary ───────────────────────────────────────────────
async function uploadImageForOption(questionOrder, optionIndex) {
  if (!fs.existsSync(ROUND3_DIR)) return null;

  const files = fs.readdirSync(ROUND3_DIR);
  const prefix = `${questionOrder}.${optionIndex}.`;
  const file = files.find(f => f.startsWith(prefix));

  if (!file) return null;

  const filePath = path.join(ROUND3_DIR, file);
  const publicId = `${CLOUDINARY_FOLDER}/q${questionOrder}_opt${optionIndex}`;

  console.log(`   📤 Uploading ${file} to Cloudinary...`);

  let uploadPath = filePath;
  try {
    // Compress if file exceeds Cloudinary's 10MB limit
    uploadPath = await compressIfNeeded(filePath, file);

    const result = await cloudinary.uploader.upload(uploadPath, {
      public_id: publicId,
      overwrite: true,
      resource_type: 'image',
    });
    console.log(`   ✅ Uploaded: ${result.secure_url}`);
    return result.secure_url;
  } catch (err) {
    console.error(`   ❌ Upload failed for ${file}:`, err.message);
    return null;
  } finally {
    // Clean up temp file if we created one
    if (uploadPath !== filePath && fs.existsSync(uploadPath)) {
      fs.unlinkSync(uploadPath);
    }
  }
}

const round3Questions = [
  {
    question_order: 1,
    question: "I felt replaced when a new toy arrived.",
    image_urls: ["", "", "", ""],
    correct_index: 1,
    hints: ["I once organized a toy rescue mission."],
    points: 100
  },
  {
    question_order: 2,
    question: "I live in a dentist's aquarium and try to escape often.",
    image_urls: ["", "", "", ""],
    correct_index: 3,
    hints: ["I am the leader of the tank gang."],
    points: 100
  },
  {
    question_order: 3,
    question: "I lost a big race because of my pride",
    image_urls: ["", "", "", ""],
    correct_index: 1,
    hints: ["A small desert town changed me"],
    points: 100
  },
  {
    question_order: 4,
    question: "I secretly followed a signal meant for someone else and ended up on a dangerous island.",
    image_urls: ["", "", "", ""],
    correct_index: 2,
    hints: ["I used a jet and contacted my children before things escalated."],
    points: 100
  },
  {
    question_order: 5,
    question: "I learned cooking by watching a famous chef on TV.",
    image_urls: ["", "", "", ""],
    correct_index: 0,
    hints: ["I hide under someone's hat to guide them."],
    points: 100
  },
    {
    question_order: 6,
    question: "I spend my time cleaning up messes left by others.",
    image_urls: ["", "", "", ""],
    correct_index: 3,
    hints: ["I repeatedly say one word that sounds like my name."],
    points: 100
  },
  {
    question_order: 7,
    question: "I was admired as a hero before becoming an enemy.",
    image_urls: ["", "", "", ""],
    correct_index: 1,
    hints: ["My obsession led me to chase something others thought was a myth."],
    points: 100
  },
  {
    question_order: 8,
    question: "I once felt abandoned and was afraid of being left behind again.",
    image_urls: ["", "", "", ""],
    correct_index: 3,
    hints: ["A song about 'when somebody loved me' tells my story."],
    points: 100
  },
  {
    question_order: 9,
    question: "I helped search for a lost clownfish.",
    image_urls: ["", "", "", ""],
    correct_index: 1,
    hints: ["I forgot almost everything very quickly"],
    points: 100
  },
  {
    question_order: 10,
    question: "I may look broken, but I know every secret of my town.",
    image_urls: ["", "", "", ""],
    correct_index: 0,
    hints: ["I once took part in a spy adventure way beyond my usual life."],
    points: 100
  }
];

async function seed() {
  console.log('🚀 Seeding Round 3 questions...');
  console.log('☁️  Using Cloudinary for image storage\n');

  await ensureCloudinaryFolder();

  for (const q of round3Questions) {
    console.log(`\nProcessing Question ${q.question_order}...`);

    // Copy existing URLs so we don't lose them if local files don't exist
    const finalImageUrls = [...q.image_urls];

    // Upload images from public/round3 to Cloudinary
    for (let i = 0; i < 4; i++) {
      const optionIndex = i + 1; // 1 to 4
      const uploadedUrl = await uploadImageForOption(q.question_order, optionIndex);
      if (uploadedUrl) {
        finalImageUrls[i] = uploadedUrl;
      }
    }

    const payload = { ...q, image_urls: finalImageUrls };

    const { error } = await supabase.from('round_3_questions').upsert(payload, { onConflict: 'question_order' });
    if (error) {
      console.error(`❌ Error seeding question ${q.question_order}:`, error.message);
    } else {
      console.log(`✅ Seeded question ${q.question_order} successfully.`);
    }
  }

  console.log('\n🎉 Done seeding Round 3!');
}

if (require.main === module) {
  seed();
}

module.exports = { round3Questions, seed };
