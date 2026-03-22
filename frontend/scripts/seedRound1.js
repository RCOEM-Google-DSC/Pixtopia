const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function parseLine(line) {
  const fields = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        // Escaped quote ("") → literal "
        cur += '"';
        i++; // skip next quote
      } else {
        inQ = !inQ;
      }
    } else if (ch === "," && !inQ) {
      fields.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

async function seed() {
  const csvPath = path.resolve(__dirname, "round1.csv");
  const content = fs.readFileSync(csvPath, "utf-8");

  const rawLines = content.split(/\r?\n/);
  const mergedLines = [];
  let buffer = "";
  for (const line of rawLines) {
    buffer += (buffer ? "\n" : "") + line;
    if ((buffer.match(/"/g) || []).length % 2 === 0) { mergedLines.push(buffer); buffer = ""; }
  }
  if (buffer) mergedLines.push(buffer);

  const headers = parseLine(mergedLines[0]);
  const parseOrNull = (val) => {
    if (!val || val === "null") return null;
    try { return JSON.parse(val); } catch { return null; }
  };

  let success = 0;
  for (let i = 1; i < mergedLines.length; i++) {
    const line = mergedLines[i].trim();
    if (!line) continue;
    const vals = parseLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || null; });

    const payload = {
      id: row.id,
      round_id: row.round_id,
      question_order: parseInt(row.order),
      question: row.question,
      options: parseOrNull(row.options),
      correct_index: parseInt(row.correct_index),
      image_urls: parseOrNull(row.image_urls),
      letters: parseOrNull(row.letters),
      answer: row.answer && row.answer !== "null" ? row.answer : null,
      points: parseInt(row.points) || 100,
      video_url: row.video_url && row.video_url !== "null" ? row.video_url : null,
      hint: row.hint && row.hint !== "null" ? row.hint : null,
      hint_cost: parseInt(row.hint_cost) || 10,
    };

    const { error } = await supabase.from("questions").upsert(payload, { onConflict: "id" });
    if (error) {
      console.error(`❌ Q${payload.question_order}:`, error.message);
    } else {
      console.log(`✅ Q${payload.question_order}: ${payload.question.substring(0, 60)}...`);
      success++;
    }
  }
  console.log(`\n🎉 Done! ${success} questions seeded.`);
}

seed().catch(console.error);
