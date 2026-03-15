import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { currentAnswer, questionOrder = 1 } = body;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = await createAdminClient();

    // Fetch team and questions in parallel to reduce latency
    const [teamResult, questionsResult] = await Promise.all([
      admin
        .from("teams")
        .select("id, points")
        .or(`leader_id.eq.${user.id},team_members_ids.cs.{${user.id}}`)
        .maybeSingle(),
      admin
        .from("questions")
        .select("*")
        .eq("round_id", "4")
        .order("id", { ascending: false }),
    ]);

    if (teamResult.error || !teamResult.data) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }
    const team = teamResult.data;

    // Deduplicate questions by order (keeps most recently inserted row per order)
    const seen = new Map<number, any>();
    for (const q of questionsResult.data ?? []) {
      const existing = seen.get(q.order);
      if (!existing || q.id > existing.id) seen.set(q.order, q);
    }
    const question = seen.get(questionOrder) ?? null;

    if (questionsResult.error || !question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    // Fetch existing submission (needs team.id from previous step)
    const { data: submission } = await admin
      .from("submissions")
      .select("round4")
      .eq("team_id", team.id)
      .maybeSingle();

    const r4 = submission?.round4 || {};
    const hintsKey = `q${questionOrder}_hints_revealed`;

    if (questionOrder >= 4) {
      // Part B: Text Hint (boolean flag)
      if (r4[hintsKey]) {
        return NextResponse.json({ hint: question.hint, alreadyRevealed: true });
      }

      const cost = question.hint_cost || 10;
      if (team.points < cost) {
        return NextResponse.json({ error: "Insufficient points" }, { status: 400 });
      }

      const updatedRound4 = {
        ...r4,
        [hintsKey]: true,
        points_spent: (r4.points_spent || 0) + cost,
      };

      const [updateErr, upsertErr] = await Promise.all([
        admin.from("teams").update({ points: team.points - cost }).eq("id", team.id)
          .then((r) => r.error),
        admin.from("submissions").upsert(
          { team_id: team.id, ...(submission ?? {}), round4: updatedRound4 },
          { onConflict: "team_id" }
        ).then((r) => r.error),
      ]);

      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
      if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

      return NextResponse.json({
        hint: question.hint,
        cost,
        newBalance: team.points - cost,
      });
    } else {
      // Part A: Reveal Letter (existing logic)
      if (!question.answer) return NextResponse.json({ error: "Invalid question data" }, { status: 500 });
      
      const hintsRevealed: number[] = r4[hintsKey] || [];
      if (hintsRevealed.length >= question.answer.length) {
        return NextResponse.json({ error: "All letters revealed" }, { status: 400 });
      }

      const cost = 10 * (hintsRevealed.length + 1);
      if (team.points < cost) {
        return NextResponse.json({ error: "Insufficient points" }, { status: 400 });
      }

      // Pick index to reveal — prefer letters not yet typed correctly
      const allIndices = Array.from({ length: question.answer.length }, (_, i) => i);
      let available = allIndices.filter((idx) => !hintsRevealed.includes(idx));
      if (currentAnswer && currentAnswer.length === question.answer.length) {
        const filtered = available.filter((idx) => currentAnswer[idx] !== question.answer[idx]);
        if (filtered.length > 0) available = filtered;
      }
      const revealedIndex = available[Math.floor(Math.random() * available.length)];
      const revealedChar = question.answer[revealedIndex];

      const updatedHints = [...hintsRevealed, revealedIndex];
      const updatedRound4 = {
        ...r4,
        [hintsKey]: updatedHints,
        points_spent: (r4.points_spent || 0) + cost,
      };

      const [updateErr, upsertErr] = await Promise.all([
        admin.from("teams").update({ points: team.points - cost }).eq("id", team.id)
          .then((r) => r.error),
        admin.from("submissions").upsert(
          { team_id: team.id, ...(submission ?? {}), round4: updatedRound4 },
          { onConflict: "team_id" }
        ).then((r) => r.error),
      ]);

      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
      if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

      return NextResponse.json({
        revealedIndex,
        revealedChar,
        cost,
        newBalance: team.points - cost,
      });
    }
  } catch (err: any) {
    console.error("Round4 hint error:", err);
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
