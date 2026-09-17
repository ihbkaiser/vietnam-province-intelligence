import type { ClassRoom, Subject, User } from "@/lib/types";
import { assertClassAccess, HttpError } from "../auth";
import { store } from "../repositories/memoryStore";

function subjectLabel(subject: Subject): string {
  if (subject === "history") return "Lịch sử";
  if (subject === "geography") return "Địa lí";
  return "Lịch sử & Địa lí";
}

function normalizeGrade(grade?: number): number {
  return grade && grade >= 6 && grade <= 9 ? grade : 6;
}

export function listClasses(user: User) {
  return store.classesForUser(user).map((classRoom) => ({
    ...classRoom,
    students: classRoom.studentIds.map((id) => store.userById(id)).filter(Boolean)
  }));
}

export function createClassForTeacher(
  user: User,
  input: {
    name: string;
    subject?: Subject;
    grade?: number;
    academicYear?: string;
    knowledgeScopes?: string[];
    studentUsernames?: string[];
  }
): ClassRoom {
  if (user.role !== "teacher") throw new HttpError(403, "Only teachers can create classes");
  const grade = normalizeGrade(input.grade);
  const subject = input.subject || "mixed";
  return store.createClass({
    name: input.name,
    subject,
    subjectLabel: subjectLabel(subject),
    grade,
    academicYear: input.academicYear || "2026-2027",
    teacherId: user.id,
    knowledgeScopes: [`Toàn bộ SGK Lớp ${grade}`],
    studentUsernames: input.studentUsernames
  });
}

export function addStudentByUsername(user: User, classId: string, username: string) {
  assertClassAccess(user, classId);
  if (user.role !== "teacher") throw new HttpError(403, "Only teachers can add students");
  return store.addMemberByUsername(classId, username);
}

export function searchStudents(user: User, query = "") {
  if (user.role !== "teacher" && user.role !== "admin") throw new HttpError(403, "Forbidden");
  return store.searchUsers({ role: "student", query }).slice(0, 20);
}
