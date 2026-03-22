"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./authContext";
import { getTeamByLeader, getTeamSubmission, subscribeToTeam, TeamData, SubmissionData } from "./database";

export function useTeam() {
  const { user } = useAuth();
  const [team, setTeam] = useState<TeamData | null>(null);
  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTeam(null);
      setSubmission(null);
      setLoading(false);
      return;
    }

    // Auth often resolves after first paint (user was null → defined). Without
    // setting loading here, dashboard score shows 0 until getTeamByLeader returns.
    setLoading(true);
    setTeam(null);
    setSubmission(null);

    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        // Step 1: find my team using my leader UID
        const t = await getTeamByLeader(user.id);
        setTeam(t);

        // Step 2: subscribe to real-time team updates (points, etc.)
        if (t?.id) {
          unsubscribe = subscribeToTeam(t.id, (updated) => {
            setTeam(updated);
          });

          // Step 3: fetch submission using team's ID
          try {
            const s = await getTeamSubmission(t.id);
            setSubmission(s);
          } catch {
            // Submission might not exist yet — that's fine
            setSubmission(null);
          }
        }
      } catch {
        // Team might not exist (e.g. admin account has no team)
        setTeam(null);
        setSubmission(null);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      unsubscribe?.();
    };
  }, [user?.id]);

  const refreshSubmission = useCallback(async () => {
    if (!team?.id) return;
    try {
      const s = await getTeamSubmission(team.id);
      setSubmission(s);
    } catch {
      // ignore
    }
  }, [team?.id]);

  return { team, submission, loading, refreshSubmission };
}
