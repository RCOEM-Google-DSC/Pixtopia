require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables.');
  // In dev/test environments we might not have these, so we'll just log and continue
  if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL || 'http://localhost:54321', SERVICE_ROLE_KEY || 'mock', {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET_NAME = 'round3';
const ROUND3_DIR = path.join(__dirname, '../public/round3');

async function ensureBucket() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) {
    console.error('❌ Error listing buckets:', error.message);
    return;
  }
  if (!buckets?.find(b => b.name === BUCKET_NAME)) {
    console.log(`🪣 Creating public bucket '${BUCKET_NAME}'...`);
    await supabase.storage.createBucket(BUCKET_NAME, { public: true });
  }
}

async function uploadImageForOption(questionOrder, optionIndex) {
  if (!fs.existsSync(ROUND3_DIR)) return null;
  
  const files = fs.readdirSync(ROUND3_DIR);
  // Matches "1.1.png", "1.1.jpg", etc.
  const prefix = `${questionOrder}.${optionIndex}.`;
  const file = files.find(f => f.startsWith(prefix));
  
  if (!file) return null;

  const filePath = path.join(ROUND3_DIR, file);
  const fileBuffer = fs.readFileSync(filePath);
  
  // Create a unique filename so it updates properly and doesn't collide
  const ext = path.extname(file).toLowerCase();
  const fileName = `q${questionOrder}_opt${optionIndex}_${Date.now()}${ext}`;
  
  let contentType = 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  else if (ext === '.webp') contentType = 'image/webp';
  else if (ext === '.gif') contentType = 'image/gif';

  console.log(`   📤 Uploading ${file} to Supabase bucket...`);
  const { data, error } = await supabase.storage.from(BUCKET_NAME).upload(fileName, fileBuffer, {
    contentType,
    upsert: true
  });
  
  if (error) {
    console.error(`   ❌ Upload failed for ${file}:`, error.message);
    return null;
  }
  
  const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
  return publicUrlData.publicUrl;
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
    question: "I live in a dentist’s aquarium and try to escape often.",
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
    hints: ["I hide under someone’s hat to guide them."],
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
    hints: ["A song about “when somebody loved me” tells my story."],
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
  
  await ensureBucket();
  
  for (const q of round3Questions) {
    console.log(`\nProcessing Question ${q.question_order}...`);
    
    // Copy existing URLs so we don't lose them if local files don't exist
    const finalImageUrls = [...q.image_urls];
    
    // Check local public/round3 directory for updated images 1.1 to 1.4, etc.
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
