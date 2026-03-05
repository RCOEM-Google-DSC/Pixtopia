/**
 * seedSupabase.js
 * Replaces importTeams.js — seeds Pixtopia data directly to Supabase.
 *
 * Usage:
 *   node scripts/seedSupabase.js
 *
 * Prerequisites:
 *   1. Copy .env.local to scripts/.env (or set env vars in the shell)
 *   2. Place unstop_data.csv in the scripts/ folder
 *   3. Run schema.sql in the Supabase SQL Editor first
 *
 * CSV format (same as importTeams.js):
 *   teamName, email, hackeRankUrl, year, phoneNo, branch, isLeader
 */

require('dotenv').config({ path: '../.env.local' });
const fs = require('fs');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  console.error('   Make sure your .env.local is in the frontend/ directory and contains both keys.');
  process.exit(1);
}

// Admin client — bypasses RLS, never exposed to browser
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generatePassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

const inputCSV = 'unstop_data.csv';
const teamsData = {};

console.log('📖 Reading CSV data...');

fs.createReadStream(inputCSV)
  .on('error', () => {
    console.error("❌ Missing 'unstop_data.csv'. Place it in the scripts/ folder.");
    process.exit(1);
  })
  .pipe(csv())
  .on('data', (row) => {
    const { teamName, email, hackeRankUrl, year, phoneNo, branch, isLeader } = row;
    const cleanTeamName = teamName ? teamName.trim() : 'Unknown Team';

    if (!teamsData[cleanTeamName]) {
      teamsData[cleanTeamName] = { teamName: cleanTeamName, members: [], leader: null };
    }

    const memberData = {
      email: email?.trim(),
      hackerRankUrl: hackeRankUrl?.trim(),
      year: year?.trim(),
      phoneNo: phoneNo?.trim(),
      branch: branch?.trim(),
      isLeader: String(isLeader).trim().toLowerCase() === 'true',
    };

    teamsData[cleanTeamName].members.push(memberData);
    if (memberData.isLeader) {
      teamsData[cleanTeamName].leader = memberData;
    }
  })
  .on('end', async () => {
    console.log('✅ CSV parsed. Uploading teams to Supabase...\n');
    await seedTeams();
  });

// ─── Seed Teams ───────────────────────────────────────────────────────────────

async function seedTeams() {
  const results = { success: 0, failed: 0, skipped: 0 };

  for (const [teamName, teamInfo] of Object.entries(teamsData)) {
    try {
      // Fallback: if no leader marked, use first member
      if (!teamInfo.leader && teamInfo.members.length > 0) {
        teamInfo.leader = teamInfo.members[0];
      }

      if (!teamInfo.leader || !teamInfo.leader.email) {
        console.log(`⚠️  Skipping [${teamName}]: no valid leader email.`);
        results.skipped++;
        continue;
      }

      const leaderEmail = teamInfo.leader.email;
      const generatedPassword = generatePassword();

      console.log(`Processing: [${teamName}] | Leader: ${leaderEmail}`);

      // ── 1. Create Supabase Auth user for the leader ──────────────────────
      let leaderId;
      const { data: authData, error: authError } =
        await supabase.auth.admin.createUser({
          email: leaderEmail,
          password: generatedPassword,
          email_confirm: true,        // skip email verification
          user_metadata: { team_name: teamName },
        });

      if (authError) {
        if (authError.message?.includes('already been registered')) {
          // User exists — update password and fetch their ID
          console.log(`   💡 ${leaderEmail} already exists. Updating password...`);
          const { data: existing } = await supabase.auth.admin.listUsers();
          const found = existing?.users?.find(u => u.email === leaderEmail);
          if (!found) throw new Error(`Could not find existing user: ${leaderEmail}`);
          await supabase.auth.admin.updateUserById(found.id, { password: generatedPassword });
          leaderId = found.id;
        } else {
          throw authError;
        }
      } else {
        leaderId = authData.user.id;
      }

      // ── 2. Upsert all members into `users` table ─────────────────────────
      const teamMemberIds = [];

      for (const member of teamInfo.members) {
        const isCurrentLeader = member.email === leaderEmail;
        // Leader gets their auth UUID; other members get random UUIDs
        const userId = isCurrentLeader ? leaderId : crypto.randomUUID();
        teamMemberIds.push(userId);

        const { error: userErr } = await supabase.from('users').upsert(
          {
            id: userId,
            email: member.email || '',
            hacker_rank_url: member.hackerRankUrl || '',
            year: member.year || '',
            phone_no: member.phoneNo || '',
            branch: member.branch || '',
          },
          { onConflict: 'id' }
        );

        if (userErr) {
          console.warn(`   ⚠️  Could not upsert user ${member.email}: ${userErr.message}`);
        }
      }

      // ── 3. Insert team into `teams` table ────────────────────────────────
      const { error: teamErr } = await supabase.from('teams').insert({
        team_name: teamName,
        leader_id: leaderId,
        team_members_ids: teamMemberIds,
        points: 0,
        password: generatedPassword,
      });

      if (teamErr) {
        // If team already exists (duplicate team name run), warn and continue
        if (teamErr.code === '23505') {
          console.log(`   ⚠️  Team [${teamName}] already exists in DB — skipping insert.`);
        } else {
          throw teamErr;
        }
      }

      console.log(`   ✅ Team [${teamName}] seeded successfully.`);
      console.log(`   🔑 Password for ${leaderEmail}: ${generatedPassword}\n`);
      results.success++;

    } catch (err) {
      console.error(`   ❌ Error processing [${teamName}]:`, err.message ?? err);
      results.failed++;
    }
  }

  console.log('\n══════════════════════════════════════════');
  console.log(`🎉 Done! ${results.success} teams seeded, ${results.failed} failed, ${results.skipped} skipped.`);
  console.log('══════════════════════════════════════════\n');

  if (results.success > 0) {
    console.log('Next steps:');
    console.log('  1. Distribute the passwords shown above to each team leader.');
    console.log('  2. Seed questions via the Supabase dashboard or add a questions seed.');
    console.log('  3. The game_state singleton row was created by schema.sql (id = "current").');
  }
}
