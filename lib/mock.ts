// 1단계 프로토타입용 가짜 데이터. 2단계에서 Supabase로 교체한다.
import { addDays, dateKey, type EventKind, type Grade, type SlotKey, type WeatherKey } from "./weather";

export type GradeStat = { grade: Grade; score: number; count: number };

export type Forecast = {
  slot: SlotKey;
  overallScore: number;
  participants: number;
  byGrade: GradeStat[];
  topTags: { tag: string; count: number }[];
  casterComment: string;
};

export type AlertComment = {
  id: string;
  alertId: string;
  weather?: WeatherKey;
  nickname: string;
  body: string;
  createdAt: number;
  reports: number;
};

export type Alert = {
  id: string;
  level: "주의보" | "경보";
  kind: "tag" | "chat";
  grade: Grade | null;
  title: string;
  body: string;
  issuedAt: string;
};

export type CalEvent = {
  id: string;
  title: string;
  date: string;
  kind: EventKind;
  grades: Grade[]; // 비어 있으면 전체 학년
  time?: string;
  place?: string;
};

export const POST_CATEGORIES = ["정보", "질문", "잡담", "분실물"] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];

export type PostComment = { id: string; nickname: string; body: string; createdAt: number; weather?: WeatherKey };

export type Post = {
  id: string;
  weather?: WeatherKey;
  category: PostCategory;
  grade: Grade | null;
  nickname: string;
  title: string;
  body: string;
  createdAt: number;
  likes: number;
  comments: PostComment[];
};

export const TODAY_FORECASTS: Forecast[] = [
  {
    slot: "morning",
    overallScore: 58,
    participants: 41,
    byGrade: [
      { grade: "1학년", score: 74, count: 12 },
      { grade: "2학년", score: 61, count: 10 },
      { grade: "3학년", score: 38, count: 13 },
      { grade: "4학년", score: 55, count: 4 },
      { grade: "초과학기", score: 50, count: 2 },
    ],
    topTags: [
      { tag: "수면부족", count: 19 },
      { tag: "과제", count: 15 },
      { tag: "통학", count: 9 },
      { tag: "시험", count: 6 },
      { tag: "그냥", count: 4 },
    ],
    casterComment:
      "좋은 아침입니다. 현재 학부 상공에는 수면부족 저기압이 넓게 자리 잡고 있습니다. 1교시 강의실 부근은 눈꺼풀 낙하 확률 80%이니, 외출 시 아메리카노를 꼭 챙기시기 바랍니다.",
  },
  {
    slot: "noon",
    overallScore: 47,
    participants: 87,
    byGrade: [
      { grade: "1학년", score: 70, count: 24 },
      { grade: "2학년", score: 52, count: 21 },
      { grade: "3학년", score: 24, count: 27 },
      { grade: "4학년", score: 45, count: 11 },
      { grade: "초과학기", score: 38, count: 4 },
    ],
    topTags: [
      { tag: "과제", count: 41 },
      { tag: "수면부족", count: 30 },
      { tag: "팀플", count: 17 },
      { tag: "시험", count: 12 },
      { tag: "술병", count: 8 },
    ],
    casterComment:
      "점심 예보입니다. 3학년 지역에서 운영체제 과제 전선이 빠르게 북상 중입니다. 학식 줄은 평소보다 길겠으나 돈까스 출현 소식에 체감 멘탈은 소폭 상승하겠습니다. 데드락에 걸리지 않도록 서로 자원을 양보하세요.",
  },
  {
    slot: "evening",
    overallScore: 41,
    participants: 132,
    byGrade: [
      { grade: "1학년", score: 66, count: 35 },
      { grade: "2학년", score: 47, count: 30 },
      { grade: "3학년", score: 18, count: 41 },
      { grade: "4학년", score: 40, count: 19 },
      { grade: "초과학기", score: 32, count: 7 },
    ],
    topTags: [
      { tag: "과제", count: 63 },
      { tag: "수면부족", count: 44 },
      { tag: "팀플", count: 25 },
      { tag: "코딩에러", count: 21 },
      { tag: "술병", count: 11 },
    ],
    casterComment:
      "저녁 예보 전해드립니다. 오늘 밤 실습실 일대에는 '마감 전야' 현상으로 국지적 밤샘이 예상됩니다. 세그멘테이션 폴트 소나기가 곳곳에 내리겠으니, 커밋은 자주, 푸시는 확실하게 해두시기 바랍니다.",
  },
];

export const TODAY_ALERTS: Alert[] = [
  {
    id: "a1",
    level: "경보",
    kind: "tag",
    grade: "3학년",
    title: "3학년 운영체제 과제 폭풍 경보",
    body:
      "오후 2시 기준, 3학년 지역 관측자의 62%가 '#과제'를 보고했습니다. 마감 D-1 과제 전선이 정체하면서 밤사이 집중 호우가 예상됩니다. 주민 여러분은 스택 오버플로우 대피소 위치를 미리 확인해 두십시오.",
    issuedAt: "14:20",
  },
  {
    id: "a2",
    level: "주의보",
    kind: "chat",
    grade: null,
    title: "학부 전역 수다 급증 주의보",
    body:
      "최근 30분간 댓글량이 평소의 4배로 급증했습니다. 원인은 '내일 휴강설'로 추정되며, 아직 공식 확인되지 않은 루머성 기압골입니다. 출석은 평소대로 하시기 바랍니다.",
    issuedAt: "17:05",
  },
];

// 지난 날의 실제 날씨 (오늘 기준 -3 ~ -1)
export function pastScores(today: Date): Record<string, number> {
  return {
    [dateKey(addDays(today, -3))]: 72,
    [dateKey(addDays(today, -2))]: 64,
    [dateKey(addDays(today, -1))]: 51,
  };
}

export function initialEvents(today: Date): CalEvent[] {
  const d = (n: number) => dateKey(addDays(today, n));
  return [
    { id: "e1", title: "자료구조 과제 3 마감", date: d(-2), kind: "deadline", grades: ["2학년"], time: "23:59" },
    { id: "e2", title: "학과 취업 특강", date: d(-1), kind: "event", grades: [], time: "16:00", place: "공학관 대강당" },
    { id: "e3", title: "알고리즘 강의실 변경", date: d(0), kind: "room", grades: ["3학년"], time: "13:00", place: "공학관 214호 → 312호" },
    { id: "e4", title: "운영체제 과제 2 마감", date: d(1), kind: "deadline", grades: ["3학년"], time: "23:59" },
    { id: "e5", title: "C프로그래밍 실습 마감", date: d(1), kind: "deadline", grades: ["1학년"], time: "18:00" },
    { id: "e6", title: "자료구조 중간고사", date: d(2), kind: "exam", grades: ["2학년"], time: "10:00", place: "공학관 101호" },
    { id: "e7", title: "캡스톤 중간 발표", date: d(2), kind: "presentation", grades: ["4학년"], time: "14:00", place: "세미나실" },
    { id: "e8", title: "컴퓨터구조 퀴즈", date: d(3), kind: "exam", grades: ["3학년"], time: "09:00" },
    { id: "e9", title: "학부 해커톤", date: d(5), kind: "event", grades: [], time: "10:00", place: "공학관 로비" },
    { id: "e10", title: "이산수학 보강", date: d(7), kind: "room", grades: ["1학년"], time: "15:00", place: "공학관 205호" },
    { id: "e11", title: "데이터베이스 팀플 중간 보고서", date: d(9), kind: "deadline", grades: ["3학년"], time: "23:59" },
    { id: "e12", title: "객체지향 프로젝트 제안서", date: d(11), kind: "deadline", grades: ["2학년"], time: "18:00" },
    { id: "e13", title: "학과 체육대회", date: d(14), kind: "event", grades: [], place: "대운동장" },
    { id: "e14", title: "웹프로그래밍 시험", date: d(16), kind: "exam", grades: ["4학년"], time: "13:00" },
    { id: "e15", title: "졸업작품 최종 제출", date: d(20), kind: "deadline", grades: ["4학년", "초과학기"], time: "17:00" },
  ];
}

export function initialPosts(now: number): Post[] {
  const ago = (min: number) => now - min * 60000;
  return [
    {
      id: "p1", category: "정보", grade: "3학년", nickname: "3학년 관측자 76", likes: 24, createdAt: ago(35),
      title: "운영체제 과제 2 질문 모음 정리했어요",
      body: "조교님 답변이랑 단톡에서 나온 질문들 정리했어요.\n\n1. fork 후 wait 안 하면 좀비 프로세스 생김 → 꼭 wait 호출\n2. 스케줄러 타임퀀텀은 과제 명세의 10ms 기준\n3. 보고서는 PDF로만 제출\n\n틀린 거 있으면 댓글로 알려주세요!",
      comments: [
        { id: "pc1", nickname: "3학년 관측자 83", body: "천사세요? 2번 몰랐는데 감사합니다", createdAt: ago(30) },
        { id: "pc2", nickname: "3학년 관측자 90", body: "보고서 분량 제한도 있나요?", createdAt: ago(12) },
      ],
    },
    {
      id: "p2", category: "질문", grade: "1학년", nickname: "1학년 관측자 97", likes: 3, createdAt: ago(80),
      title: "이중 포인터가 도저히 이해가 안 돼요 ㅠ",
      body: "int **p 이런 거 나오면 머리가 하얘집니다... 좋은 설명 자료 있을까요?",
      comments: [{ id: "pc3", nickname: "2학년 관측자 14", body: "그림으로 박스 그려가면서 보면 훨씬 나아요! 주소를 담은 상자를 또 담은 상자", createdAt: ago(60) }],
    },
    {
      id: "p3", category: "잡담", grade: null, nickname: "익명 관측자 21", likes: 11, createdAt: ago(140),
      title: "중문 새로 생긴 국밥집 가본 사람",
      body: "시험 끝나고 가보려는데 맛있나요? 혼밥 가능한지도 궁금",
      comments: [],
    },
    {
      id: "p4", category: "분실물", grade: null, nickname: "익명 관측자 28", likes: 2, createdAt: ago(200),
      title: "공학관 3층 실습실에서 에어팟 케이스 주웠어요",
      body: "흰색 케이스, 스티커 붙어 있어요. 학과 사무실에 맡겨뒀습니다!",
      comments: [],
    },
    {
      id: "p5", category: "정보", grade: "4학년", nickname: "4학년 관측자 35", likes: 31, createdAt: ago(60 * 26),
      title: "여름 인턴 지원 후기 + 포트폴리오 팁",
      body: "작년에 지원했던 경험 공유해요. 깃허브 README 정리가 생각보다 중요했고, 프로젝트는 많이보다 하나를 깊게 설명하는 게 좋았어요.",
      comments: [{ id: "pc4", nickname: "3학년 관측자 42", body: "선배 감사합니다 🙏", createdAt: ago(60 * 20) }],
    },
    {
      id: "p6", category: "질문", grade: "2학년", nickname: "2학년 관측자 49", likes: 6, createdAt: ago(60 * 5),
      title: "자료구조 중간고사 범위 어디까지인가요?",
      body: "트리까지인지 그래프까지인지 헷갈려요",
      comments: [{ id: "pc5", nickname: "2학년 관측자 56", body: "수업 때 트리까지라고 하셨어요!", createdAt: ago(60 * 4) }],
    },
  ];
}

export function initialAlertComments(now: number): AlertComment[] {
  const ago = (min: number) => now - min * 60000;
  return [
    { id: "c1", alertId: "a1", nickname: "3학년 관측자 27", body: "스케줄러 구현하다가 내 일정이 스케줄링 안 됨", createdAt: ago(42), reports: 0 },
    { id: "c2", alertId: "a1", nickname: "3학년 관측자 34", body: "경보 맞음 ㅋㅋㅋㅋ 지금 실습실 만석", createdAt: ago(37), reports: 0 },
    { id: "c3", alertId: "a1", nickname: "4학년 관측자 41", body: "작년에 저도 저기서 살아 나왔습니다. 힘내세요", createdAt: ago(30), reports: 0 },
    { id: "c4", alertId: "a1", nickname: "3학년 관측자 48", body: "fork 하다가 프로세스도 나도 좀비 됨", createdAt: ago(12), reports: 0 },
    { id: "c5", alertId: "a2", nickname: "2학년 관측자 55", body: "휴강이면 진짜 운동장 한 바퀴 뜀", createdAt: ago(25), reports: 0 },
    { id: "c6", alertId: "a2", nickname: "1학년 관측자 62", body: "출처가 어디예요??", createdAt: ago(22), reports: 0 },
    { id: "c7", alertId: "a2", nickname: "익명 관측자 69", body: "내 꿈에서 봄", createdAt: ago(20), reports: 1 },
  ];
}
