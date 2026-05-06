import type { Role } from "@/types/db";

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  role: Exclude<Role, "manager">;
  requestedStudentEmail?: string;
}

type Result<T> = { success: true; data: T } | { success: false; error: { errors: { message: string }[] } };

function parseSignUp(v: unknown): Result<SignUpInput> {
  if (!v || typeof v !== "object") {
    return fail("请求数据格式不正确");
  }
  const o = v as Record<string, unknown>;
  const email = o.email;
  const password = o.password;
  const fullName = o.fullName;
  const role = o.role;
  const rse = o.requestedStudentEmail;

  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("请填写有效的邮箱地址");
  }
  if (typeof password !== "string" || password.length < 8) {
    return fail("密码至少需要 8 位");
  }
  if (typeof fullName !== "string" || fullName.trim().length < 2) {
    return fail("请填写姓名");
  }
  if (role !== "counselor" && role !== "student" && role !== "parent") {
    return fail("角色必须是顾问、学生或家长");
  }
  if (
    rse !== undefined &&
    rse !== null &&
    rse !== "" &&
    (typeof rse !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rse))
  ) {
    return fail("学生邮箱格式不正确");
  }
  return {
    success: true,
    data: {
      email: email.toLowerCase().trim(),
      password,
      fullName: fullName.trim(),
      role,
      requestedStudentEmail:
        rse && typeof rse === "string" ? rse.toLowerCase().trim() : undefined,
    },
  };
}

function fail(message: string): Result<never> {
  return { success: false, error: { errors: [{ message }] } };
}

export const z = {
  signUpInput: { safeParse: parseSignUp },
};
