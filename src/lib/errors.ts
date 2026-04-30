import type { ErrorCode } from "../types/sidecar";

const MESSAGES: Record<ErrorCode, string> = {
  INVALID_URL: "URL inválida — use um link do YouTube.",
  DOWNLOAD_FAILED: "Falha ao baixar o vídeo. Verifique sua conexão e tente novamente.",
  VIDEO_UNAVAILABLE: "Vídeo indisponível (privado, removido ou bloqueado por região).",
  MODEL_LOAD_FAILED: "Falha ao carregar o modelo de separação. Verifique espaço em disco e tente novamente.",
  SEPARATION_FAILED: "Erro durante a separação. Tente outra música.",
  INSUFFICIENT_DISK: "Espaço em disco insuficiente.",
  GPU_OOM: "Memória de GPU insuficiente. Tente forçar CPU nas configurações.",
  CANCELLED: "Operação cancelada.",
  INTERNAL: "Erro interno. Veja os logs pra detalhes.",
};

export function friendlyError(code: ErrorCode | null, fallback?: string): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  return fallback || "Erro desconhecido.";
}
