export type UserRole = "student" | "gef";
export type ProposalStatus = "received" | "analysis" | "development" | "scheduled" | "completed" | "archived";
export type ActivityStatus = "upcoming" | "done" | "cancelled";
export type ActivityFeedbackRating = "great" | "good" | "ok" | "poor";

export type PlatformUser = {
  id: string;
  name: string;
  turma: string;
  role: UserRole;
};

export type ProposalRecord = {
  id: string;
  title: string;
  body: string;
  author: string;
  authorId: string;
  anonymous: boolean;
  theme: string;
  status: ProposalStatus;
  supports: number;
  comments: number;
  createdAt: string;
  updatedAt: string;
  origin: "student" | "gef";
  gefResponse?: string;
  gefResponseAt?: string;
};

export type CommentRecord = {
  id: string;
  proposalId: string;
  author: string;
  authorId: string;
  role: UserRole;
  anonymous: boolean;
  body: string;
  createdAt: string;
  parentId?: string;
  likes: number;
};

export type SupporterRecord = { id: string; name: string; turma: string };

export type ActivityRecord = {
  id: string;
  proposalId: string;
  title: string;
  date: string;
  time: string;
  place: string;
  audience: string;
  status: ActivityStatus;
};

export type ActivityFeedbackRecord = {
  id: string;
  activityId: string;
  userId: string;
  userName: string;
  turma: string;
  participated: boolean;
  reasonNotParticipated?: string;
  rating?: ActivityFeedbackRating;
  comment?: string;
  createdAt: string;
};

export type NotificationRecord = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  activityId?: string;
};

export type ChapaProposalRecord = { area: string; title: string; detail: string };
export type ChapaRecord = { id: string; name: string; tagline: string; color: string; proposals: ChapaProposalRecord[] };

export type ChapaQuestionRecord = {
  id: string;
  chapaId: string;
  proposalArea: string;
  proposalTitle?: string;
  question: string;
  author: string;
  authorId: string;
  turma: string;
  answered: boolean;
  answer?: string;
  answeredBy?: string;
  answeredAt?: string;
  createdAt: string;
};

export type PlatformSnapshot = {
  proposals: ProposalRecord[];
  comments: CommentRecord[];
  activities: ActivityRecord[];
  notifications: NotificationRecord[];
  supportedByUser: Record<string, string[]>;
  savedByUser: Record<string, string[]>;
  likedCommentsByUser: Record<string, string[]>;
  supportersByProposal: Record<string, SupporterRecord[]>;
  chapas: ChapaRecord[];
  activityFeedbacks: Record<string, ActivityFeedbackRecord[]>;
  chapaQuestions: ChapaQuestionRecord[];
};

export const CHAPA_AREAS = ["Esportes e movimento", "Cultura e música", "Convivência e descanso", "Participação"] as const;

export const CHAPAS: ChapaRecord[] = [
  {
    id: "chapa-1",
    name: "Chapa 1",
    tagline: "Mais opções para cada jeito de viver o intervalo.",
    color: "#0758b1",
    proposals: [
      { area: CHAPA_AREAS[0], title: "Circuito de jogos rápidos", detail: "Rodízio de modalidades curtas em dias combinados com as turmas." },
      { area: CHAPA_AREAS[1], title: "Palco aberto", detail: "Espaço para apresentações voluntárias de música, poesia e dança." },
      { area: CHAPA_AREAS[2], title: "Pátio de convivência", detail: "Mais bancos, sombra e jogos tranquilos em uma área sinalizada." },
      { area: CHAPA_AREAS[3], title: "Calendário construído com as turmas", detail: "Encontros mensais para acompanhar propostas e devolver decisões." },
    ],
  },
  {
    id: "chapa-2",
    name: "Chapa 2",
    tagline: "Um recreio ativo, criativo e aberto a novas ideias.",
    color: "#f45a1a",
    proposals: [
      { area: CHAPA_AREAS[0], title: "Desafio recreativo semanal", detail: "Atividades inclusivas com inscrição simples e participação por rodízio." },
      { area: CHAPA_AREAS[1], title: "Rádio do intervalo", detail: "Seleção musical sugerida pelos estudantes em horários definidos." },
      { area: CHAPA_AREAS[2], title: "Estações de descanso", detail: "Cantinhos com leitura, conversa e jogos de mesa para diferentes ritmos." },
      { area: CHAPA_AREAS[3], title: "Mural de acompanhamento", detail: "Atualizações públicas sobre cada proposta e seus próximos passos." },
    ],
  },
];
