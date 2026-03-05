/**
 * teamAuth.ts
 * Utility for creating a team with its leader's Supabase Auth account.
 * Used by the seed script and any admin tooling (not exposed to the UI).
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in environment — server-side only.
 */
import { createClient } from "@supabase/supabase-js";

interface UserProfile {
  email: string;
  hackerRankUrl: string;
  year: string;
  phoneNo: string;
  branch: string;
}

interface TeamData {
  teamName: string;
  password: string; // Storing plain-text by design
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Creates a team along with its leader's authentication and user profile.
 *
 * Flow:
 * 1. Creates a Supabase Auth user for the team leader.
 * 2. Inserts the leader's profile into the `users` table.
 * 3. Inserts the team document into the `teams` table.
 */
export async function createTeamWithLeader(
  userProfile: UserProfile,
  teamData: TeamData
) {
  const supabase = getAdminClient();

  try {
    // 1. Create Auth user for the team leader
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: userProfile.email,
        password: teamData.password,
        email_confirm: true, // Skip email confirmation flow
      });

    if (authError) throw authError;
    const leaderId = authData.user.id;

    // 2. Insert the leader's profile into `users`
    const { error: userError } = await supabase.from("users").insert({
      id: leaderId,
      email: userProfile.email,
      hacker_rank_url: userProfile.hackerRankUrl,
      year: userProfile.year,
      phone_no: userProfile.phoneNo,
      branch: userProfile.branch,
    });
    if (userError) throw userError;

    // 3. Insert the team into `teams`
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({
        team_name: teamData.teamName,
        leader_id: leaderId,
        team_members_ids: [leaderId],
        points: 0,
        password: teamData.password,
      })
      .select("id")
      .single();

    if (teamError) throw teamError;

    console.log("Successfully created Team and Leader Profile!");

    return {
      success: true,
      leaderId,
      teamId: team.id,
    };
  } catch (error) {
    console.error("Error creating team and leader:", error);
    throw error;
  }
}
