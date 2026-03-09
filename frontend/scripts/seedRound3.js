require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');

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

const round3Questions = [
  {
    question_order: 1,
    question: "This character is a legendary racer who learns that there's more to life than just winning. Who is he?",
    image_urls: [
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/mcqueen.jpg",
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/mater.jpg",
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/doc.jpg",
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/sally.jpg"
    ],
    correct_index: 0,
    hints: ["He's a bright red race car.", "His catchphrase is 'Kachow!'"],
    points: 100
  },
  {
    question_order: 2,
    question: "This small robot was designed to clean up Earth but ended up finding love in space. What's his name?",
    image_urls: [
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/eve.jpg",
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/wall-e.jpg",
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/mo.jpg",
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/auto.jpg"
    ],
    correct_index: 1,
    hints: ["He loves collecting trinkets like sporks.", "He has a pet cockroach."],
    points: 100
  },
  {
    question_order: 3,
    question: "This chef might be a rat, but he's the best cook in Paris. What's his name?",
    image_urls: [
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/linguini.jpg",
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/remy.jpg",
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/colette.jpg",
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/emile.jpg"
    ],
    correct_index: 1,
    hints: ["He controls a human by pulling his hair.", "His idol is Gusteau."],
    points: 100
  },
  {
    question_order: 4,
    question: "This 'scary' monster is actually a big softie who accidentally brings a human child into the monster world. Who is he?",
    image_urls: [
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/mike.jpg",
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/randall.jpg",
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/sulley.jpg",
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/roz.jpg"
    ],
    correct_index: 2,
    hints: ["He has blue fur with purple spots.", "His best friend is a one-eyed green monster."],
    points: 100
  },
  {
    question_order: 5,
    question: "This toy cowboy is Andy's favorite and always looks out for his friends. Who is he?",
    image_urls: [
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/woody.jpg",
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/buzz.jpg",
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/jessie.jpg",
      "https://res.cloudinary.com/di679vukp/image/upload/v1/pixtopia/rex.jpg"
    ],
    correct_index: 0,
    hints: ["There's a snake in his boot!", "He has a pull-string on his back."],
    points: 100
  }
];

async function seed() {
  console.log('🚀 Seeding Round 3 questions...');
  
  for (const q of round3Questions) {
    const { error } = await supabase.from('round_3_questions').upsert(q, { onConflict: 'question_order' });
    if (error) {
      console.error(`❌ Error seeding question ${q.question_order}:`, error.message);
    } else {
      console.log(`✅ Seeded question ${q.question_order}`);
    }
  }
  
  console.log('🎉 Done!');
}

if (require.main === module) {
  seed();
}

module.exports = { round3Questions, seed };
