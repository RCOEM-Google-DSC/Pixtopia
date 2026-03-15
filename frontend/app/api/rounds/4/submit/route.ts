import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (err) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { answer, answerIndex, questionOrder = 1 } = body;
    if (questionOrder < 1 || questionOrder > 3 && (answerIndex === undefined)) {
        if (!answer && answerIndex === undefined) {
          return NextResponse.json(
            { error: "Answer is required" },
            { status: 400 },
          );
        }
    }
    if (questionOrder < 1 || questionOrder > 6) {
      return NextResponse.json(
        { error: "Invalid questionOrder" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = await createAdminClient();

    // Fetch team
    const { data: team, error: teamError } = await admin
      .from("teams")
      .select("id, points")
      .or(`leader_id.eq.${user.id},team_members_ids.cs.{${user.id}}`)
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Optimized: Fetch ONLY the specific question needed
    const { data: question, error: questionError } = await admin
      .from("questions")
      .select("*")
      .eq("round_id", "4")
      .eq("order", questionOrder)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (questionError || !question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    // Validate answer based on question type
    if (questionOrder >= 4) {
      // Part B: MCQ
      if (answerIndex === undefined) {
        return NextResponse.json({ error: "Answer index is required" }, { status: 400 });
      }
      if (Number(answerIndex) !== question.correct_index) {
        return NextResponse.json({ error: "Incorrect answer" }, { status: 400 });
      }
    } else {
      // Part A: Visual Puzzle
      if (!answer) {
        return NextResponse.json({ error: "Answer is required" }, { status: 400 });
      }
      if (answer.trim().toUpperCase() !== (question.answer || "").toUpperCase()) {
        return NextResponse.json({ error: "Incorrect answer" }, { status: 400 });
      }
    }

    // Fetch existing submission
    const { data: submission } = await admin
      .from("submissions")
      .select("round4")
      .eq("team_id", team.id)
      .maybeSingle();

    const r4 = submission?.round4 || {};
    const qCompletedKey = `q${questionOrder}_completed`;

    // Don't double-award points if already completed
    if (r4[qCompletedKey]) {
      return NextResponse.json({
        success: true,
        pointsAdded: 0,
        alreadyCompleted: true,
        allDone: r4.is_completed || false,
      });
    }

    // Check if all questions (1-6) are completed
    const allDone = [1, 2, 3, 4, 5, 6].every((n) => 
      n === questionOrder ? true : !!r4[`q${n}_completed`]
    );

    const updatedRound4 = {
      ...r4,
      [qCompletedKey]: true,
      is_completed: allDone,
      submitted_at: new Date().toISOString(),
    };

    // Award points
    const { error: teamUpdateError } = await admin
      .from("teams")
      .update({ points: team.points + (question.points || 0) })
      .eq("id", team.id);

    if (teamUpdateError) {
      return NextResponse.json(
        { error: teamUpdateError.message },
        { status: 500 },
      );
    }

    const { error: upsertErr } = await admin.from("submissions").upsert(
      {
        team_id: team.id,
        ...(submission ?? {}),
        round4: updatedRound4,
      },
      { onConflict: "team_id" },
    );

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      pointsAdded: question.points || 0,
      newBalance: team.points + (question.points || 0),
      allDone,
    });
  } catch (err: any) {
    console.error("DEBUG ERR:", err);
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 },
    );
  }
}
