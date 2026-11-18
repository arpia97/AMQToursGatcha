// MPEG Layer III frame tables, indexed by the bitrate code in the frame header.
const MPEG1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES = [44100, 48000, 32000];

function frame(bytes, offset) {
  if (offset + 4 > bytes.length || bytes[offset] !== 255) return null;
  const b = bytes[offset + 1], c = bytes[offset + 2];
  if ((b & 224) !== 224 || (b & 6) !== 2) return null;
  const version = (b >> 3) & 3;
  if (version === 1) return null;
  const bitrate = (version === 3 ? MPEG1 : MPEG2)[c >> 4];
  const rate = SAMPLE_RATES[(c >> 2) & 3] / (version === 3 ? 1 : version === 2 ? 2 : 4);
  if (!bitrate || !rate) return null;
  const length = Math.floor((version === 3 ? 144000 : 72000) * bitrate / rate) + ((c >> 1) & 1);
  return length > 4 && offset + length <= bytes.length
    ? { length, rate, seconds: (version === 3 ? 1152 : 576) / rate }
    : null;
}

export function mp3TagLength(bytes) {
  if (bytes.length < 10 || bytes[0] !== 73 || bytes[1] !== 68 || bytes[2] !== 51) return 0;
  return 10 + (bytes[6] << 21 | bytes[7] << 14 | bytes[8] << 7 | bytes[9]);
}

export function clipMp3(bytes, position, duration) {
  // Skip the leading ID3v2 tag. The clip contains only audio frames and starts
  // after the first frame when possible, omitting Xing/Info duration metadata.
  let first = mp3TagLength(bytes);
  const limit = Math.min(bytes.length - 4, first + 65536);
  let head;
  for (; first < limit; first++) {
    head = frame(bytes, first);
    if (head && frame(bytes, first + head.length)?.rate === head.rate) break;
  }
  if (first >= limit) throw Error("Invalid MPEG audio.");
  const offsets = [first];
  let next = first + head.length;
  for (let current; (current = frame(bytes, next))?.rate === head.rate; ) {
    offsets.push(next);
    next += current.length;
  }
  offsets.push(next);
  const audioFrames = offsets.length - 1;
  // Fraction of the available sample range, matching the old random seek.
  const frames = Math.ceil(duration / head.seconds);
  const start = 1 + Math.floor(Math.max(0, audioFrames - 1 - frames) * position);
  return bytes.subarray(offsets[start], offsets[Math.min(start + frames, audioFrames)]);
}
