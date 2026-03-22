import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSubmissions() {
  const { data } = await supabase.from('submissions').select('team_id, round3').limit(3);
  console.dir(data, { depth: null });
}

checkSubmissions();
