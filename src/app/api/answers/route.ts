import { NextRequest } from "next/server";
import { saveAnswer } from "@/lib/db";

/** Persist an Ask result for a shareable /a/{id} permalink. */
export async function POST(request: NextRequest) {
  try {
    const { question, answer, sources } = await request.json();
    if (!question || !answer || typeof question !== "string" || typeof answer !== "string") {
      return Response.json({ error: "Missing question or answer" }, { status: 400 });
    }
    const id = await saveAnswer(
      question.slice(0, 1000),
      answer.slice(0, 20000),
      Array.isArray(sources) ? sources : [],
    );
    return Response.json({ id });
  } catch (error) {
    console.error("Save answer failed:", error);
    return Response.json({ error: "Failed to save answer" }, { status: 500 });
  }
}
