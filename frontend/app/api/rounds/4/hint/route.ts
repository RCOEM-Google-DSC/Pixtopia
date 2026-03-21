import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { round4PartAQuestions } from "@/lib/round4PartAQuestions";
import { round4PartBQuestions } from "@/lib/round4PartB";

const MAX_PART_A_HINTS = 3;

function getQuestionByOrder(order: number) {
  if (order <= 3) {
    const q = round4PartAQuestions.find((q) => q.order === order);
    return q ? { order: q.order, answer: q.answer, hint: q.hint } : null;
  }
  const q = round4PartBQuestions.find((q) => q.order === order);
  return q ? { order: q.order, answer: undefined, hint: q.hint } : null;
}

function getNextHintCost(r4: any, questionOrder: number): number {
  let count = 0;
  const isPart1 = questionOrder <= 3;

  if (r4) {
    for (const key of Object.keys(r4)) {
      if (key.endsWith("_hints_revealed")) {
        // Extract the question number from "qX_hints_revealed"
        const qNumMatch = key.match(/^q(\d+)_/);
        if (qNumMatch) {
          const qNum = parseInt(qNumMatch[1], 10);
          const thisKeyIsPart1 = qNum <= 3;
          if (isPart1 === thisKeyIsPart1) {
            const val = r4[key];
            if (Array.isArray(val)) count += val.length;
            else if (val === true) count += 1;
          }
        }
      }
    }
  }
  const costs = [100, 110, 130];
  return count < costs.length ? costs[count] : 130;
}

async function getTeamForUser(userId: string) {
  const admin = await createAdminClient();

  const { data, error } = await admin
    .from("teams")
    .select("id, points")
    .or(`leader_id.eq.${userId},team_members_ids.cs.{"${userId}"}`)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [team, question] = await Promise.all([
      getTeamForUser(user.id),
      Promise.resolve(getQuestionByOrder(questionOrder)),
    ]);

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (!question) {
      return NextResponse.json(
        { error: "Question not found" },
        { status: 404 },
      );
    }

    const admin = await createAdminClient();

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
        return NextResponse.json({
          hint: question.hint,
          alreadyRevealed: true,
        });
      }

      const cost = getNextHintCost(r4, questionOrder);
      if (team.points < cost) {
        return NextResponse.json(
          { error: "Insufficient points" },
          { status: 400 },
        );
      }

      const updatedRound4 = {
        ...r4,
        [hintsKey]: true,
        points_spent: (r4.points_spent || 0) + cost,
      };

      const [updateErr, upsertErr] = await Promise.all([
        admin
          .from("teams")
          .update({ points: team.points - cost })
          .eq("id", team.id)
          .then((r) => r.error),
        admin
          .from("submissions")
          .upsert(
            { team_id: team.id, ...(submission ?? {}), round4: updatedRound4 },
            { onConflict: "team_id" },
          )
          .then((r) => r.error),
      ]);

      if (updateErr)
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      if (upsertErr)
        return NextResponse.json({ error: upsertErr.message }, { status: 500 });

      return NextResponse.json({
        hint: question.hint,
        cost,
        newBalance: team.points - cost,
      });
    } else {
      // Part A: Reveal Letter (existing logic)
      if (!question.answer)
        return NextResponse.json(
          { error: "Invalid question data" },
          { status: 500 },
        );

      const hintsRevealed: number[] = r4[hintsKey] || [];
      const maxHintsForQuestion = Math.min(
        MAX_PART_A_HINTS,
        question.answer.length,
      );

      if (hintsRevealed.length >= maxHintsForQuestion) {
        return NextResponse.json(
          { error: "Maximum hints reached" },
          { status: 400 },
        );
      }

      const cost = getNextHintCost(r4, questionOrder);
      if (team.points < cost) {
        return NextResponse.json(
          { error: "Insufficient points" },
          { status: 400 },
        );
      }

      // Pick index to reveal — prefer letters not yet typed correctly
      const allIndices = Array.from(
        { length: question.answer.length },
        (_, i) => i,
      );
      let available = allIndices.filter((idx) => !hintsRevealed.includes(idx));
      if (currentAnswer && currentAnswer.length === question.answer.length) {
        const filtered = available.filter(
          (idx) => currentAnswer[idx] !== question.answer[idx],
        );
        if (filtered.length > 0) available = filtered;
      }
      const revealedIndex =
        available[Math.floor(Math.random() * available.length)];
      const revealedChar = question.answer[revealedIndex];

      const updatedHints = [...hintsRevealed, revealedIndex];
      const updatedRound4 = {
        ...r4,
        [hintsKey]: updatedHints,
        points_spent: (r4.points_spent || 0) + cost,
      };

      const [updateErr, upsertErr] = await Promise.all([
        admin
          .from("teams")
          .update({ points: team.points - cost })
          .eq("id", team.id)
          .then((r) => r.error),
        admin
          .from("submissions")
          .upsert(
            { team_id: team.id, ...(submission ?? {}), round4: updatedRound4 },
            { onConflict: "team_id" },
          )
          .then((r) => r.error),
      ]);

      if (updateErr)
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      if (upsertErr)
        return NextResponse.json({ error: upsertErr.message }, { status: 500 });

      return NextResponse.json({
        revealedIndex,
        revealedChar,
        cost,
        newBalance: team.points - cost,
      });
    }
  } catch (err: any) {
    console.error("Round4 hint error:", err);
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 },
    );
  }
}
