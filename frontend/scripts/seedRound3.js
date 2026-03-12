require('dotenv').config({ path: '../.env.local' });
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
    question: "This character is a legendary racer who learns that there's more to life than just winning. Who is he?",
    image_urls: ["", "", "", ""],
    correct_index: 0,
    hints: ["He's a bright red race car.", "His catchphrase is 'Kachow!'"],
    points: 100
  },
  {
    question_order: 2,
    question: "This small robot was designed to clean up Earth but ended up finding love in space. What's his name?",
    image_urls: ["", "", "", ""],
    correct_index: 1,
    hints: ["He loves collecting trinkets like sporks.", "He has a pet cockroach."],
    points: 100
  },
  {
    question_order: 3,
    question: "This chef might be a rat, but he's the best cook in Paris. What's his name?",
    image_urls: ["", "", "", ""],
    correct_index: 1,
    hints: ["He controls a human by pulling his hair.", "His idol is Gusteau."],
    points: 100
  },
  {
    question_order: 4,
    question: "This 'scary' monster is actually a big softie who accidentally brings a human child into the monster world. Who is he?",
    image_urls: ["", "", "", ""],
    correct_index: 2,
    hints: ["He has blue fur with purple spots.", "His best friend is a one-eyed green monster."],
    points: 100
  },
  {
    question_order: 5,
    question: "This toy cowboy is Andy's favorite and always looks out for his friends. Who is he?",
    image_urls: ["", "", "", ""],
    correct_index: 0,
    hints: ["There's a snake in his boot!", "He has a pull-string on his back."],
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
