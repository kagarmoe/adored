import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { UserController } from "@/server/api/users";
import { UserRepository } from "@/server/repositories/implementations/UserRepository";
import { getDb } from "@/lib/db";
import { errorResponse } from "@/server/api/http-errors";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const userRepo = new UserRepository(db);
    const controller = new UserController(userRepo);

    const user = await controller.getCurrentUser(session.user.id);
    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
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
    const userRepo = new UserRepository(db);
    const controller = new UserController(userRepo);

    const user = await controller.updateCurrentUser(session.user.id, body);
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
    const userRepo = new UserRepository(db);
    const controller = new UserController(userRepo);

    const user = await controller.deleteCurrentUser(session.user.id);
    return NextResponse.json({ message: "User account deleted", user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
