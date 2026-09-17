import type {
  AppSnapshot,
  ClassRoom,
  NotificationItem,
  Quiz,
  QuizAssignment,
  TeachingDocument,
  User
} from "./types";

const now = new Date().toISOString();

export const users: User[] = [
  { id: "admin-195", username: "Admin195", displayName: "Admin195", role: "admin", email: "admin195@edugeo.local" },
  { id: "teacher-lan", username: "colan", displayName: "Cô Lan", role: "teacher", email: "lan@edugeo.local" },
  { id: "student-khang", username: "mkhang10a1", displayName: "Nguyễn Minh Khang", role: "student" },
  { id: "student-han", username: "giahann", displayName: "Trần Gia Hân", role: "student" },
  { id: "student-anh", username: "ducanh_ls", displayName: "Lê Đức Anh", role: "student" }
];

export const classes: ClassRoom[] = [
  {
    id: "class-history-10a1",
    name: "Lịch sử và Địa lí 6A1",
    subject: "mixed",
    subjectLabel: "Lịch sử & Địa lí",
    grade: 6,
    academicYear: "2026-2027",
    teacherId: "teacher-lan",
    knowledgeScopes: ["Toàn bộ SGK Lớp 6"],
    studentIds: ["student-khang", "student-han", "student-anh"],
    progress: 72
  },
  {
    id: "class-geo-11a2",
    name: "Lịch sử và Địa lí 6A2",
    subject: "mixed",
    subjectLabel: "Lịch sử & Địa lí",
    grade: 6,
    academicYear: "2026-2027",
    teacherId: "teacher-lan",
    knowledgeScopes: ["Toàn bộ SGK Lớp 6"],
    studentIds: ["student-khang", "student-han"],
    progress: 58
  },
  {
    id: "class-history-12a3",
    name: "Lịch sử và Địa lí 6A3",
    subject: "mixed",
    subjectLabel: "Lịch sử & Địa lí",
    grade: 6,
    academicYear: "2026-2027",
    teacherId: "teacher-lan",
    knowledgeScopes: ["Toàn bộ SGK Lớp 6"],
    studentIds: ["student-anh"],
    progress: 83
  },
  {
    id: "class-geo-10a4",
    name: "Lịch sử và Địa lí 6A4",
    subject: "mixed",
    subjectLabel: "Lịch sử & Địa lí",
    grade: 6,
    academicYear: "2026-2027",
    teacherId: "teacher-lan",
    knowledgeScopes: ["Toàn bộ SGK Lớp 6"],
    studentIds: [],
    progress: 41
  }
];

export const documents: TeachingDocument[] = [];

export const quizzes: Quiz[] = [
  {
    id: "quiz-climate-review",
    title: "Khí hậu & biến đổi khí hậu",
    subject: "geography",
    classId: "class-geo-11a2",
    knowledgeScope: "Khí hậu & biến đổi khí hậu",
    status: "reviewing",
    authorId: "teacher-lan",
    durationMinutes: 15,
    createdAt: now,
    updatedAt: now,
    questions: [
      {
        id: "q-climate-1",
        prompt: "Câu 1. Yếu tố nào tác động mạnh nhất đến sự phân hóa khí hậu Việt Nam theo chiều Bắc - Nam?",
        explanation: "Vĩ độ địa lý làm thay đổi góc nhập xạ và nền nhiệt theo chiều Bắc - Nam.",
        sourceMarkers: ["S1"],
        options: [
          { id: "q1-a", label: "A", text: "Địa hình", isCorrect: false },
          { id: "q1-b", label: "B", text: "Vĩ độ địa lý", isCorrect: true },
          { id: "q1-c", label: "C", text: "Dòng biển", isCorrect: false },
          { id: "q1-d", label: "D", text: "Thổ nhưỡng", isCorrect: false }
        ]
      },
      {
        id: "q-climate-2",
        prompt: "Câu 2. Biểu hiện nào phản ánh rõ nhất tác động của biến đổi khí hậu ở vùng ven biển?",
        explanation: "Nước biển dâng làm tăng nguy cơ xâm nhập mặn, ngập lụt và thay đổi sinh kế ven biển.",
        sourceMarkers: ["S2"],
        options: [
          { id: "q2-a", label: "A", text: "Gia tăng biên độ nhiệt ngày", isCorrect: false },
          { id: "q2-b", label: "B", text: "Nước biển dâng và xâm nhập mặn", isCorrect: true },
          { id: "q2-c", label: "C", text: "Giảm hoàn toàn lượng mưa", isCorrect: false },
          { id: "q2-d", label: "D", text: "Mở rộng diện tích rừng tự nhiên", isCorrect: false }
        ]
      }
    ]
  },
  {
    id: "quiz-civilization-assigned",
    title: "Văn minh cổ đại phương Đông",
    subject: "history",
    classId: "class-history-10a1",
    knowledgeScope: "Văn minh cổ đại",
    status: "published",
    authorId: "teacher-lan",
    durationMinutes: 12,
    dueAt: "2026-08-21T15:00:00.000Z",
    createdAt: now,
    updatedAt: now,
    questions: [
      {
        id: "q-civ-1",
        prompt: "Điều kiện tự nhiên nào có vai trò quan trọng đối với sự hình thành các quốc gia cổ đại phương Đông?",
        explanation: "Các đồng bằng ven sông lớn tạo điều kiện thuận lợi cho nông nghiệp và cư trú tập trung.",
        sourceMarkers: ["S1"],
        options: [
          { id: "civ-1-a", label: "A", text: "Các đồng bằng ven sông lớn, đất đai màu mỡ", isCorrect: true },
          { id: "civ-1-b", label: "B", text: "Các cao nguyên khô hạn và biệt lập", isCorrect: false },
          { id: "civ-1-c", label: "C", text: "Các đảo nhỏ nằm xa lục địa", isCorrect: false },
          { id: "civ-1-d", label: "D", text: "Các vùng núi cao quanh năm băng tuyết", isCorrect: false }
        ]
      }
    ]
  }
];

export const assignments: QuizAssignment[] = [
  {
    id: "assignment-civ-10a1",
    quizId: "quiz-civilization-assigned",
    classId: "class-history-10a1",
    status: "open",
    dueAt: "2026-08-21T15:00:00.000Z",
    createdAt: now
  }
];

export const notifications: NotificationItem[] = [
  {
    id: "notif-quiz-civ",
    userId: "student-khang",
    type: "quiz_assigned",
    title: "Cô Lan đã thêm Quiz mới",
    body: "Văn minh cổ đại phương Đông - 10 câu - hạn 22:00 hôm nay",
    actionView: "studentQuiz",
    createdAt: now
  }
];

export function createInitialSnapshot(): AppSnapshot {
  return {
    users: structuredClone(users),
    classes: structuredClone(classes),
    documents: structuredClone(documents),
    quizzes: structuredClone(quizzes),
    assignments: structuredClone(assignments),
    notifications: structuredClone(notifications)
  };
}
