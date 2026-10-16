'use strict';
const SOFTWARE = 'libopenh264';
const HARDWARE = ['h264_qsv', 'h264_nvenc', 'h264_amf'];
function isHardwareFailure(error) {
  const message = String(error.message || error);
  if (/no space left|permission denied|access denied|read-only|error opening input|invalid data found|no such file/i.test(message)) return false;
  return /driver|MFX_ERR|nvenc|qsv|amf|CUDA|(?:initializ|opening|unknown|unsupported).*encoder|encoder.*(?:initializ|device|unsupported)/i.test(message);
}
function createEncoderPolicy({ probe, onFallback = () => {} }) {
  let selection = null;
  let selected = null;
  function select() {
    if (!selection) selection = (async () => {
      for (const encoder of HARDWARE) if (await probe(encoder)) { selected = encoder; return encoder; }
      selected = SOFTWARE; return SOFTWARE;
    })().catch((error) => { selection = null; throw error; });
    return selection;
  }
  return {
    async encode(convert, isCancelled = () => false) {
      const encoder = await select();
      try { await convert(encoder); return encoder; }
      catch (error) {
        if (encoder === SOFTWARE || isCancelled() || !isHardwareFailure(error)) throw error;
        selected = SOFTWARE; selection = Promise.resolve(SOFTWARE); onFallback();
        await convert(SOFTWARE); return SOFTWARE;
      }
    },
    status() {
      return { checked: selected !== null, encoder: selected,
        accelerated: selected !== null && selected !== SOFTWARE,
        label: selected === 'h264_qsv' ? 'Intel Quick Sync' : selected === 'h264_nvenc' ? 'NVIDIA' : selected === 'h264_amf' ? 'AMD' : selected === SOFTWARE ? 'Compatible por software' : 'Se comprobará al exportar' };
    }
  };
}
module.exports = { createEncoderPolicy };
