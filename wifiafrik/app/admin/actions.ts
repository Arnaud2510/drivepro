"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_SECONDS,
  checkAdminPassword,
  createAdminSession,
  verifyAdminSession,
} from "@/lib/admin-auth";
import { orderStore } from "@/lib/orders";
import { reviewManualPayment } from "@/lib/payments";

function isAdmin(): boolean {
  return verifyAdminSession(cookies().get(ADMIN_COOKIE)?.value);
}

export async function login(formData: FormData): Promise<void> {
  const candidate = formData.get("password");
  if (typeof candidate !== "string" || !checkAdminPassword(candidate)) {
    // Ralentit les essais successifs de mots de passe.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    redirect("/admin?erreur=1");
  }
  cookies().set(ADMIN_COOKIE, createAdminSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: ADMIN_SESSION_SECONDS,
  });
  redirect("/admin");
}

export async function logout(): Promise<void> {
  cookies().delete({ name: ADMIN_COOKIE, path: "/admin" });
  redirect("/admin");
}

export async function reviewPayment(formData: FormData): Promise<void> {
  if (!isAdmin()) redirect("/admin");
  const orderId = formData.get("orderId");
  const decision = formData.get("decision");
  if (typeof orderId !== "string" || (decision !== "paid" && decision !== "failed")) return;
  await reviewManualPayment(orderStore(), orderId, decision);
  revalidatePath("/admin");
}
