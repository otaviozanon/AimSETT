import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

const resources = {
  pt: {
    translation: {
      settings: "Configurações",
      targetSize: "Tamanho do alvo",
      targetSpeedTracking: "Velocidade do alvo (Tracking)",
      centerDwellFlicking: "Tempo no centro (Flicking)",
      hoverDwellTracking: "Tempo sobre o alvo (Tracking)",
      playArea: "Área de jogo",
      fullscreen: "Tela cheia",
      volume: "Volume dos sons",
      restoreDefaults: "Restaurar padrão",
      mode: "Modo",
      duration: "Duração",
      hits: "Acertos",
      start: "Começar",
      end: "Encerrar",
      backToMenu: "← Voltar ao menu",
      trainingFinished: "Treino finalizado",
      captured: "Capturados",
      score: "Score",
      acc: "Acc",
      combo: "Combo",
      targetsCapured: "Alvos capturados",
      avgAcquisition: "Aquisição média",
      bestAcquisition: "Melhor aquisição",
      worstAcquisition: "Pior aquisição",
      misses: "Erros",
      accuracy: "Precisão",
      bestCombo: "Melhor combo",
      avgReaction: "Reação média",
      centerGateHint: "Fique no centro para o alvo aparecer",
      modeLabel_flicking: "Flicking",
      modeDesc_flicking:
        "Fique com a mira no centro até o anel encher, depois clique no alvo o mais rápido possível.",
      modeLabel_tracking: "Tracking",
      modeDesc_tracking:
        "Fique com a mira em cima do alvo (sem clicar) até o anel encher para capturá-lo.",
      modeLabel_speed: "Speed",
      modeDesc_speed:
        "Alvos aparecem aleatoriamente sem pausa. Clique neles o mais rápido possível.",
      hitsUnit: "acertos",
      analysisTitle: "Análise do treino",
      average: "Média",
      median: "Mediana",
      best: "Melhor",
      worst: "Pior",
      consistency: "Consistência (±)",
      reactionPerHit: "Tempo de reação por acerto",
      acquisitionPerTarget: "Tempo de aquisição por alvo",
      timelineCaptures: "Linha do tempo — capturas",
      timelineHitsMisses: "Linha do tempo — acertos e erros",
      hit: "Acerto",
      miss: "Erro",
      shotNumber: "Tiro nº",
      runningAccuracyLabel: "Precisão acumulada",
      crosshairSettings: "Mira",
      crosshairMode: "Tipo",
      crosshairOn: "Mira",
      cursorOnly: "Apenas cursor",
      crosshairColor: "Cor",
      crosshairSize: "Tamanho",
      crosshairThickness: "Espessura",
      crosshairGap: "Espaçamento",
      crosshairDot: "Ponto central",
      crosshairDotSize: "Tamanho do ponto",
      on: "Ligado",
      off: "Desligado",
      metaDescription:
        "AimSETT — treino de mira com modos Flicking, Tracking e Speed, HUD em tempo real e análise de desempenho pós-partida.",
    },
  },
  en: {
    translation: {
      settings: "Settings",
      targetSize: "Target size",
      targetSpeedTracking: "Target speed (Tracking)",
      centerDwellFlicking: "Center dwell time (Flicking)",
      hoverDwellTracking: "Hover dwell time (Tracking)",
      playArea: "Play area",
      fullscreen: "Full screen",
      volume: "Sound volume",
      restoreDefaults: "Restore defaults",
      mode: "Mode",
      duration: "Duration",
      hits: "Hits",
      start: "Start",
      end: "End",
      backToMenu: "← Back to menu",
      trainingFinished: "Training finished",
      captured: "Captured",
      score: "Score",
      acc: "Acc",
      combo: "Combo",
      targetsCapured: "Targets captured",
      avgAcquisition: "Avg. acquisition",
      bestAcquisition: "Best acquisition",
      worstAcquisition: "Worst acquisition",
      misses: "Misses",
      accuracy: "Accuracy",
      bestCombo: "Best combo",
      avgReaction: "Avg. reaction",
      centerGateHint: "Stay at the center for the target to appear",
      modeLabel_flicking: "Flicking",
      modeDesc_flicking:
        "Hold the crosshair at the center until the ring fills, then click the target as fast as possible.",
      modeLabel_tracking: "Tracking",
      modeDesc_tracking:
        "Keep the crosshair on the target (without clicking) until the ring fills to capture it.",
      modeLabel_speed: "Speed",
      modeDesc_speed:
        "Targets appear randomly without pause. Click them as fast as possible.",
      hitsUnit: "hits",
      analysisTitle: "Training analysis",
      average: "Average",
      median: "Median",
      best: "Best",
      worst: "Worst",
      consistency: "Consistency (±)",
      reactionPerHit: "Reaction time per hit",
      acquisitionPerTarget: "Acquisition time per target",
      timelineCaptures: "Timeline — captures",
      timelineHitsMisses: "Timeline — hits and misses",
      hit: "Hit",
      miss: "Miss",
      shotNumber: "Shot #",
      runningAccuracyLabel: "Running accuracy",
      crosshairSettings: "Crosshair",
      crosshairMode: "Type",
      crosshairOn: "Crosshair",
      cursorOnly: "Cursor only",
      crosshairColor: "Color",
      crosshairSize: "Size",
      crosshairThickness: "Thickness",
      crosshairGap: "Gap",
      crosshairDot: "Center dot",
      crosshairDotSize: "Dot size",
      on: "On",
      off: "Off",
      metaDescription:
        "AimSETT — aim training with Flicking, Tracking and Speed modes, a real-time HUD and post-match performance analysis.",
    },
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: ["pt", "en"],
    load: "languageOnly",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "aimsett-language",
    },
  });

// Keep <html lang> and the meta description in sync with the active
// language, both on load and on every manual language switch — otherwise
// they'd stay stuck on the hardcoded pt-BR values from index.html even
// after the user switches to English.
function syncDocumentLanguage(lng) {
  document.documentElement.lang = lng === "en" ? "en" : "pt-BR";
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", i18n.t("metaDescription"));
}

i18n.on("languageChanged", syncDocumentLanguage);
i18n.on("initialized", () => syncDocumentLanguage(i18n.language));

export default i18n;
