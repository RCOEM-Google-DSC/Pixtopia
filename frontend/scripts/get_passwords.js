require("dotenv").config({ path: "../.env" });
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function getPasswords() {
  const { data, error } = await supabase
    .from("teams")
    .select("team_name, password")
    .in("team_name", ["GDG1", "GDG2", "GDG3", "GDG4", "GDG5", "GDG6", "GDG7", "GDG8"])
    .order("team_name");
  
  if (error) {
    console.error("Error fetching teams:", error);
    return;
  }
  
  console.log("\n--- ACTUAL TEAM PASSWORDS ---");
  for (const team of data) {
    console.log(`${team.team_name.padEnd(10)} : ${team.password}`);
  }
}

getPasswords();
