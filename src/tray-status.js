'use strict';

const CAPTURE_PHASE_LABELS = Object.freeze({
  idle: 'Lista para grabar',
  loading: 'Cargando fuentes de captura',
  'selecting-region': 'Seleccionando área de captura',
  preparing: 'Preparando captura',
  countdown: 'Cuenta atrás para capturar',
  'capturing-image': 'Capturando imagen',
  recording: 'Grabando',
  finalizing: 'Finalizando grabación',
  ready: 'Grabación pendiente de guardar',
  saving: 'Preparando guardado'
});

const SAVE_STAGE_LABELS = Object.freeze({
  recovery: 'Recuperando grabación',
  'model-download': 'Descargando modelo de transcripción',
  'audio-preparation': 'Preparando audio para transcribir',
  transcription: 'Transcribiendo',
  conversion: 'Convirtiendo video',
  finalizing: 'Guardando video y subtítulos'
});

function isValidTrayCaptureState(phase, paused) {
  return typeof phase === 'string'
    && Object.hasOwn(CAPTURE_PHASE_LABELS, phase)
    && typeof paused === 'boolean'
    && (!paused || phase === 'recording');
}

function getTrayStatusLabel({
  phase = 'idle',
  paused = false,
  sessionStatus = null,
  saveActive = false,
  saveStage = null,
  failureStage = null,
  captureWriteFailed = false
} = {}) {
  if (sessionStatus === 'preserving') return 'Conservando grabación para recuperar';
  if (saveActive || sessionStatus === 'saving') {
    return Object.hasOwn(SAVE_STAGE_LABELS, saveStage)
      ? SAVE_STAGE_LABELS[saveStage]
      : 'Preparando guardado';
  }
  if (sessionStatus === 'recording') {
    if (captureWriteFailed) return 'Captura interrumpida';
    if (phase === 'finalizing') return CAPTURE_PHASE_LABELS.finalizing;
    return paused ? 'Grabación en pausa: guardando datos' : CAPTURE_PHASE_LABELS.recording;
  }
  if (sessionStatus === 'ready') {
    if (failureStage === 'transcription') return 'Transcripción pendiente de reintentar';
    if (failureStage) return 'Guardado pendiente de reintentar';
    return CAPTURE_PHASE_LABELS.ready;
  }
  return Object.hasOwn(CAPTURE_PHASE_LABELS, phase)
    ? CAPTURE_PHASE_LABELS[phase]
    : CAPTURE_PHASE_LABELS.idle;
}

module.exports = { isValidTrayCaptureState, getTrayStatusLabel };
