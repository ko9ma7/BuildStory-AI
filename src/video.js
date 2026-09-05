import { clamp, downloadBlob } from './utils.js';

function drawFrame(ctx, width, height, analysis, milestone, index, total, progress) {
  ctx.fillStyle = '#07111f';
  ctx.fillRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, 'rgba(65, 110, 255, .30)');
  gradient.addColorStop(1, 'rgba(87, 221, 180, .08)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#8da4c2';
  ctx.font = '600 24px system-ui, sans-serif';
  ctx.fillText('BuildStory AI', 84, 86);

  ctx.fillStyle = '#f7fbff';
  ctx.font = '700 34px system-ui, sans-serif';
  ctx.fillText(analysis.slug, 84, 142);

  ctx.fillStyle = '#74e6c3';
  ctx.font = '700 26px system-ui, sans-serif';
  ctx.fillText(`DAY ${milestone.day}`, 84, 252);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 58px system-ui, sans-serif';
  wrapText(ctx, milestone.title, 84, 330, width - 168, 76, 3);

  ctx.fillStyle = '#a9bad0';
  ctx.font = '400 28px system-ui, sans-serif';
  wrapText(ctx, milestone.description, 84, 510, width - 168, 42, 2);

  const barY = height - 82;
  ctx.fillStyle = 'rgba(255,255,255,.16)';
  ctx.fillRect(84, barY, width - 168, 8);
  ctx.fillStyle = '#74e6c3';
  const segmentStart = index / total;
  const totalProgress = clamp(segmentStart + progress / total, 0, 1);
  ctx.fillRect(84, barY, (width - 168) * totalProgress, 8);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text).split(' ');
  let line = '';
  let lineIndex = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lineIndex * lineHeight);
      line = word;
      lineIndex += 1;
      if (lineIndex >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (lineIndex < maxLines) ctx.fillText(line, x, y + lineIndex * lineHeight);
}

export async function createStoryVideo(analysis, onProgress = () => {}) {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error('이 브라우저는 영상 내보내기를 지원하지 않습니다. 최신 Chrome/Edge에서 시도해주세요.');
  }
  const milestones = analysis.milestones.slice(0, 6);
  if (!milestones.length) throw new Error('영상으로 만들 스토리가 없습니다.');

  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(30);
  const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mimeType = mimeCandidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 5_000_000 } : undefined);
  const chunks = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };

  const duration = 30_000;
  const segment = duration / milestones.length;
  const startedAt = performance.now();

  const done = new Promise((resolve, reject) => {
    recorder.onerror = () => reject(new Error('영상 생성 중 브라우저 오류가 발생했습니다.'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
  });

  recorder.start(500);
  await new Promise((resolve) => {
    const tick = (now) => {
      const elapsed = Math.min(duration, now - startedAt);
      const index = Math.min(milestones.length - 1, Math.floor(elapsed / segment));
      const local = (elapsed - index * segment) / segment;
      drawFrame(ctx, canvas.width, canvas.height, analysis, milestones[index], index, milestones.length, local);
      onProgress(Math.round((elapsed / duration) * 100));
      if (elapsed >= duration) resolve(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  recorder.stop();
  const blob = await done;
  downloadBlob(blob, `${analysis.slug.replace('/', '-')}-buildstory.webm`);
  return blob;
}
