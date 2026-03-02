"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./authContext";
import { getTeamByLeader, getTeamSubmission, TeamData, SubmissionData } from "./firestore";

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

    (async () => {
      try {
        // Step 1: find my team using my leader UID
        const t = await getTeamByLeader(user.uid);
        setTeam(t);

        // Step 2: fetch submission using team's document ID (not user UID)
        if (t?.teamId) {
          try {
            const s = await getTeamSubmission(t.teamId);
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
  }, [user?.uid]);

  const refreshSubmission = useCallback(async () => {
    if (!team?.teamId) return;
    try {
      const s = await getTeamSubmission(team.teamId);
      setSubmission(s);
    } catch {
      // ignore
    }
  }, [team?.teamId]);

  return { team, submission, loading, refreshSubmission };
}
