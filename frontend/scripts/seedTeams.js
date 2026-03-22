/**
 * seedTeams.js
 * ─────────────────────────────────────────────────────────────────────────
 * Reads a CSV file (unstopdata.csv or test.csv), then:
 *   1. Creates a Supabase Auth account for each Team Leader
 *   2. Inserts every person into the `users` table
 *      (leaders use the Auth UUID as their users.id so lookups work)
 *   3. Creates a row in the `teams` table
 *
 * Usage:
 *   node seedTeams.js                  # uses unstopdata.csv
 *   node seedTeams.js test.csv         # uses test.csv
 * ─────────────────────────────────────────────────────────────────────────
 */

require("dotenv").config({ path: "../.env" });
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// ─── Supabase client (service-role for admin auth operations) ──────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Generate a random password (8 chars, mix of letters + digits + symbols) */
function generatePassword(length = 8) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$!";
  let pw = "";
  for (let i = 0; i < length; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pw;
}

/** Minimal CSV parser that handles quoted fields with commas inside them */
function parseCSVLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/** Parse the CSV file into an array of objects keyed by header */
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] || "";
    });
    rows.push(obj);
  }
  return rows;
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function seed() {
  // Determine which CSV to use (default: unstopdata.csv)
  const csvArg = process.argv[2] || "unstopdata.csv";
  const csvPath = path.resolve(__dirname, csvArg);

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  console.log(`📄 Reading CSV: ${csvArg}`);
  const rows = parseCSV(csvPath);
  console.log(`   Found ${rows.length} rows\n`);

  // ── Group rows by Team ID ────────────────────────────────────────────
  const teamsMap = new Map(); // teamId -> { teamName, members: [] }

  for (const row of rows) {
    const teamId = row["Team ID"];
    const teamName = row["Team Name"];
    const role = row["Candidate role"];
    const name = row["Candidate's Name"];
    const email = row["Candidate's Email"];
    const mobile = row["Candidate's Mobile"];
    const year = row["Year"];
    const hackerRankUrl = row["HackerRank Profile URL:"];
    const specialization = row["Specialization"] || "";

    if (!teamsMap.has(teamId)) {
      teamsMap.set(teamId, { teamName, members: [] });
    }

    teamsMap.get(teamId).members.push({
      role,
      name,
      email,
      mobile,
      year,
      hackerRankUrl,
      branch: specialization,
    });
  }

  console.log(`👥 Found ${teamsMap.size} teams\n`);

  // For final output
  const credentials = [];

  for (const [teamId, teamData] of teamsMap) {
    const { teamName, members } = teamData;
    console.log(`\n━━━ Processing team: ${teamName} (${teamId}) ━━━`);

    // Find the leader first
    const leader = members.find((m) => m.role === "Team Leader");
    if (!leader) {
      console.error(`   ❌ No Team Leader found for team ${teamName}. Skipping.`);
      continue;
    }

    // ── Step 1: Create Supabase Auth for leader FIRST ─────────────────
    // We need the Auth UUID so we can use it as the users.id for the leader.
    // This ensures leader_id in teams matches the Auth UUID used in the app.
    const teamPassword = generatePassword(8);
    let authUserId = null;

    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: leader.email,
        password: teamPassword,
        email_confirm: true,
      });

    if (authError) {
      if (authError.message.includes("already been registered")) {
        console.log(`   ⏭️  Auth user already exists for ${leader.email}`);
        // Look up existing auth user to get their id
        const { data: listData } = await supabase.auth.admin.listUsers();
        const existing = listData?.users?.find((u) => u.email === leader.email);
        if (existing) {
          authUserId = existing.id;
        }
      } else {
        console.error(`   ❌ Failed to create auth for ${leader.email}:`, authError.message);
      }
    } else {
      authUserId = authData.user.id;
      console.log(`   🔐 Created auth for leader: ${leader.email} (${authUserId})`);
    }

    if (!authUserId) {
      console.error(`   ❌ Could not get auth UUID for ${leader.email}. Skipping team.`);
      continue;
    }

    // ── Step 2: Insert all members into `users` table ─────────────────
    // For the leader, we use the Auth UUID as their users.id
    // For regular members, we let the DB auto-generate the UUID
    const userIds = [];

    for (const member of members) {
      // Check if user already exists
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("email", member.email)
        .maybeSingle();

      let userId;

      if (existingUser) {
        userId = existingUser.id;
        console.log(`   ⏭️  User already exists: ${member.email} (${userId})`);
      } else {
        const insertPayload = {
          email: member.email,
          phone_no: member.mobile,
          year: member.year,
          hacker_rank_url: member.hackerRankUrl,
          branch: member.branch,
        };

        // For leaders: set id to match their Auth UUID
        if (member.role === "Team Leader") {
          insertPayload.id = authUserId;
        }

        const { data: newUser, error: userError } = await supabase
          .from("users")
          .insert(insertPayload)
          .select("id")
          .single();

        if (userError) {
          console.error(`   ❌ Failed to insert user ${member.email}:`, userError.message);
          continue;
        }
        userId = newUser.id;
        console.log(`   ✅ Inserted user: ${member.name} (${member.email}) [${userId}]`);
      }

      userIds.push(userId);
    }

    // ── Step 3: Insert into `teams` table ────────────────────────────
    // leader_id = authUserId (which is also the users.id for the leader)
    const { data: existingTeam } = await supabase
      .from("teams")
      .select("id")
      .eq("team_name", teamName)
      .maybeSingle();

    if (existingTeam) {
      console.log(`   ⏭️  Team already exists: ${teamName}`);
    } else {
      const { error: teamError } = await supabase.from("teams").insert({
        team_name: teamName,
        points: 0,
        leader_id: authUserId,
        team_members_ids: userIds,
        password: teamPassword,
      });

      if (teamError) {
        console.error(`   ❌ Failed to insert team ${teamName}:`, teamError.message);
      } else {
        console.log(`   ✅ Inserted team: ${teamName}`);
      }
    }

    credentials.push({
      team: teamName,
      leaderEmail: leader.email,
      password: teamPassword,
    });
  }

  // ── Print credentials summary ──────────────────────────────────────
  console.log("\n\n═══════════════════════════════════════════════════════");
  console.log("  📋 TEAM CREDENTIALS (share with team leaders)");
  console.log("═══════════════════════════════════════════════════════\n");
  console.log(
    "Team Name".padEnd(30) +
      "Leader Email".padEnd(35) +
      "Password"
  );
  console.log("─".repeat(80));

  for (const cred of credentials) {
    console.log(
      cred.team.padEnd(30) +
        cred.leaderEmail.padEnd(35) +
        cred.password
    );
  }

  console.log("\n🎉 Done!\n");
}

seed().catch((err) => {
  console.error("💥 Unexpected error:", err);
  process.exit(1);
});
