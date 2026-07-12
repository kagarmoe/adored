import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { UserController } from "@/server/api/users";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/server/api/http-errors";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const user = await UserController.fromDb(db).getCurrentUser(session.user.id);
    return NextResponse.json(user);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const db = getDb();
    const user = await UserController.fromDb(db).updateCurrentUser(session.user.id, body);
    return NextResponse.json(user);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    await UserController.fromDb(db).deleteCurrentUser(session.user.id);
    return NextResponse.json({ message: "User account deleted" });
  } catch (error) {
    return errorResponse(error);
  }
}
