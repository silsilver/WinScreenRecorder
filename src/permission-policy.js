'use strict';

function allowMicrophoneRequest({ trusted, permission, mediaTypes, microphoneEnabled }) {
  return Boolean(
    trusted
    && permission === 'media'
    && microphoneEnabled
    && Array.isArray(mediaTypes)
    && mediaTypes.length > 0
    && mediaTypes.every((type) => type === 'audio')
  );
}

module.exports = { allowMicrophoneRequest };
