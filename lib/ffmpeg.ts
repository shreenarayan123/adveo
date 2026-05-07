import { uploadFileToCloudinary } from './storage';
import fs from 'fs/promises';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import os from 'os';


// ─── Helpers ──────────────────────────────────────────────────────────────────

async function downloadFile(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  await fs.writeFile(dest, Buffer.from(buffer));
}

function runFFmpeg(cmd: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    (cmd as any)
      .on('start', (cmdLine: string) => console.log('[FFmpeg] Running:', cmdLine))
      .on('end', () => { console.log('[FFmpeg] Done'); resolve(); })
      .on('error', (err: any, _stdout: any, stderr: any) => {
        console.error('[FFmpeg] Error:', err.message);
        console.error('[FFmpeg] stderr:', stderr);
        reject(err);
      })
      .run();
  });
}

/** Get media duration in seconds using ffprobe */
function getDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    (ffmpeg as any).ffprobe(filePath, (err: any, metadata: any) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
}

/** Returns true if the file has at least one audio stream */
function hasAudioStream(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    (ffmpeg as any).ffprobe(filePath, (err: any, metadata: any) => {
      if (err) { resolve(false); return; }
      resolve((metadata.streams || []).some((s: any) => s.codec_type === 'audio'));
    });
  });
}

/**
 * Write a silent WAV file to disk — pure Node.js, no FFmpeg input formats needed.
 * This is the lavfi-free alternative to `aevalsrc=0`: we write a valid WAV header
 * + zeroed PCM samples directly and feed it to FFmpeg as a regular file.
 */
async function writeSilentWav(
  filePath: string,
  durationSeconds: number,
  sampleRate = 44100,
  channels = 2,
): Promise<void> {
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const numFrames = Math.ceil(sampleRate * durationSeconds);
  const dataSize = numFrames * channels * bytesPerSample;
  const fileSize = 44 + dataSize;

  const buf = Buffer.alloc(fileSize, 0);

  // RIFF chunk
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(fileSize - 8, 4);
  buf.write('WAVE', 8, 'ascii');

  // fmt  sub-chunk
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buf.writeUInt16LE(channels * bytesPerSample, 32);
  buf.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk (already zeroed by Buffer.alloc)
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);

  await fs.writeFile(filePath, buf);
}

/**
 * Returns the FFmpeg scale+crop/pad filter chain for a given orientation.
 *
 * Vertical (9:16): Veo outputs landscape (e.g. 1280x720). We crop to the tallest
 *   centered square, then scale to 1080x1920. This gives a full-bleed portrait
 *   frame with no pillarbox bars — ideal for Reels/TikTok.
 *
 * Horizontal (16:9): straightforward scale+pad to 1920x1080. Preserves aspect
 *   ratio with black letterbox bars if the source differs.
 */
function getScaleFilter(orientation: string): string {
  if (orientation === 'horizontal') {
    return 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1';
  }
  // Vertical (9:16): center-crop then scale up
  // crop=ih*9/16:ih (take the widest 9:16 strip from the center height)
  // then scale to 1080x1920
  return 'crop=ih*9/16:ih,scale=1080:1920,setsar=1';
}

// ─── Create Slideshow from images ─────────────────────────────────────────────

export async function createSlideshow(
  imageUrls: string[],
  scenes: any[],
  orientation = 'vertical'
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'adveo-slide-'));

  try {
    const imagePaths: string[] = [];
    for (let i = 0; i < imageUrls.length; i++) {
      const filePath = path.join(tempDir, `shot-${i}.jpg`);
      await downloadFile(imageUrls[i], filePath);
      imagePaths.push(filePath);
    }

    const concatLines: string[] = [];
    for (let i = 0; i < imagePaths.length; i++) {
      const duration = scenes[i]?.duration || 4;
      concatLines.push(`file '${imagePaths[i].replace(/\\/g, '/')}'`);
      concatLines.push(`duration ${duration}`);
    }
    concatLines.push(`file '${imagePaths[imagePaths.length - 1].replace(/\\/g, '/')}'`);

    const concatFile = path.join(tempDir, 'concat.txt');
    await fs.writeFile(concatFile, concatLines.join('\n'));

    const outputPath = path.join(tempDir, `slideshow-${Date.now()}.mp4`);
    const scaleFilter = getScaleFilter(orientation);

    await runFFmpeg(
      ffmpeg()
        .input(concatFile)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions([
          '-c:v libx264',
          '-pix_fmt yuv420p',
          `-vf ${scaleFilter}`,
          '-r 24',
          '-preset fast',
        ])
        .output(outputPath)
    );

    const videoUrl = await uploadFileToCloudinary(outputPath, `slideshow-${Date.now()}.mp4`);
    return videoUrl;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

// ─── Merge Narration + BGM over video ─────────────────────────────────────────
//
// Audio mixing strategy (Option A — muted Veo clips):
//   - Video has NO audio stream.
//   - narration @ 100% volume (primary track)
//   - bgm      @  20% volume (under the narration)
//   - Mixed with amix, narration drives duration.
//
// If bgmUrl is undefined → narration is the sole audio track (no BGM).

export async function mergeAudioVideo(
  videoUrl: string,
  audioUrl: string,
  bgmUrl?: string,
  orientation = 'vertical',
): Promise<{ url: string; videoUrl: string; audioUrl: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'adveo-merge-'));

  try {
    const videoPath  = path.join(tempDir, 'video.mp4');
    const audioPath  = path.join(tempDir, 'narration.mp3');
    const outputPath = path.join(tempDir, `final-${Date.now()}.mp4`);

    const downloads: Promise<void>[] = [
      downloadFile(videoUrl, videoPath),
      downloadFile(audioUrl, audioPath),
    ];

    let bgmPath: string | null = null;
    if (bgmUrl) {
      bgmPath = path.join(tempDir, 'bgm.mp3');
      downloads.push(downloadFile(bgmUrl, bgmPath));
    }

    console.log('[FFmpeg] Downloading video, narration' + (bgmUrl ? ', and BGM' : '') + '...');
    await Promise.all(downloads);

    const videoDur = await getDuration(videoPath);
    console.log(`[FFmpeg] Video: ${videoDur.toFixed(2)}s`);

    // Target driven by VIDEO length. Clamped 16s–22s for ad safety.
    const targetDur = Math.min(Math.max(videoDur, 16), 22);
    console.log(`[FFmpeg] Target duration: ${targetDur.toFixed(2)}s | Orientation: ${orientation}`);

    const videoHasAudio = await hasAudioStream(videoPath);
    console.log(`[FFmpeg] Video has audio: ${videoHasAudio}`);

    if (bgmPath) {
      // ── WITH BGM: amix narration + bgm ──────────────────────────────────
      // Input 0: muted video  (no audio stream → only [0:v] is valid)
      // Input 1: narration    [1:a]
      // Input 2: bgm          [2:a]
      //
      // amix: narration drives duration so video isn't cut short by shorter BGM.
      // BGM is looped with -stream_loop -1 before the input so it covers the full video.
      console.log('[FFmpeg] Mixing narration @ 100% + BGM @ 20%...');

      let cmd = ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .inputOptions([])          // narration — no looping needed
        .input(bgmPath)
        .inputOptions(['-stream_loop -1']);  // loop BGM to cover full video

      // If the video itself also has audio (legacy path), include it at low volume
      if (videoHasAudio) {
        cmd = cmd.complexFilter([
          '[0:a]volume=0.15[video_ambient]',
          '[1:a]volume=1.0[narration]',
          '[2:a]volume=0.20[bgm]',
          '[video_ambient][narration][bgm]amix=inputs=3:duration=first[mixed_audio]',
        ]);
      } else {
        cmd = cmd.complexFilter([
          '[1:a]volume=1.0[narration]',
          '[2:a]volume=0.20[bgm]',
          '[narration][bgm]amix=inputs=2:duration=first[mixed_audio]',
        ]);
      }

      cmd = cmd
        .outputOptions([
          '-map 0:v',
          '-map [mixed_audio]',
          '-c:v copy',
          '-c:a aac',
          '-b:a 192k',
          `-t ${targetDur}`,
          '-movflags +faststart',
        ])
        .output(outputPath);

      await runFFmpeg(cmd);
    } else if (!videoHasAudio) {
      // ── NO BGM, MUTED VIDEO: narration is sole audio ─────────────────────
      console.log('[FFmpeg] No BGM — narration is sole audio track.');
      await runFFmpeg(
        ffmpeg()
          .input(videoPath)
          .input(audioPath)
          .outputOptions([
            '-map 0:v',
            '-map 1:a',
            '-c:v copy',
            '-c:a aac',
            '-b:a 192k',
            `-t ${targetDur}`,
            '-shortest',
            '-movflags +faststart',
          ])
          .output(outputPath)
      );
    } else {
      // ── LEGACY: video has ambient audio — mix with narration ─────────────
      console.log('[FFmpeg] Video has audio → mixing ambient @ 25% with narration @ 100%.');
      await runFFmpeg(
        ffmpeg()
          .input(videoPath)
          .inputOptions(['-stream_loop -1'])
          .input(audioPath)
          .complexFilter([
            '[0:a]volume=0.25[veo_bgm]',
            '[1:a]volume=1.0[narration]',
            '[veo_bgm][narration]amix=inputs=2:duration=longest[mixed_audio]',
          ])
          .outputOptions([
            '-map 0:v',
            '-map [mixed_audio]',
            '-c:v copy',
            '-c:a aac',
            '-b:a 192k',
            `-t ${targetDur}`,
            '-movflags +faststart',
          ])
          .output(outputPath)
      );
    }

    const finalUrl = await uploadFileToCloudinary(outputPath, `final-${Date.now()}.mp4`);
    console.log('[FFmpeg] Final video uploaded:', finalUrl);
    return { url: finalUrl, videoUrl, audioUrl };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

// ─── Concatenate Multiple Clips ───────────────────────────────────────────────
//
// CRITICAL: Option A muted Veo clips have NO audio stream. The filter_complex
// concat filter [N:a] will crash ("Invalid argument") if audio pads don't exist.
//
// Fix: during normalization, probe each clip. If muted, synthesize a silent
// audio track via a WAV file so every normalized clip has a guaranteed audio
// stream before the concat filter runs.
//
// Also applies orientation-specific scale+pad so all clips match the target
// resolution before concat (prevents aspect ratio mismatches).

export async function concatenateClips(
  clipUrls: string[],
  targetDurationSeconds?: number,
  orientation = 'vertical',
): Promise<string> {
  if (!Array.isArray(clipUrls) || clipUrls.length === 0) {
    throw new Error('concatenateClips requires at least one clip URL');
  }

  if (clipUrls.length === 1) {
    return clipUrls[0];
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'adveo-concat-'));

  try {
    // Step 0: Download all clips
    const localClipPaths: string[] = [];
    for (let i = 0; i < clipUrls.length; i++) {
      const localPath = path.join(tempDir, `clip-${i}.mp4`);
      console.log(`[FFmpeg] Downloading clip ${i + 1}/${clipUrls.length}:`, clipUrls[i]);
      await downloadFile(clipUrls[i], localPath);
      localClipPaths.push(localPath);
    }

    const scaleFilter = getScaleFilter(orientation);
    console.log(`[FFmpeg] Orientation: ${orientation} → scale filter: ${scaleFilter}`);

    // Step 1: Normalize each clip — apply scale/pad to target resolution + ensure audio stream.
    const normalizedPaths: string[] = [];
    for (let i = 0; i < localClipPaths.length; i++) {
      const normalizedPath = path.join(tempDir, `norm-${i}.mp4`);
      const clipHasAudio = await hasAudioStream(localClipPaths[i]);
      console.log(`[FFmpeg] Clip ${i + 1} — has audio: ${clipHasAudio}. Normalizing...`);

      if (!clipHasAudio) {
        // Muted clip: write a silent WAV and use it as audio input.
        const silentWavPath = path.join(tempDir, `silence-${i}.wav`);
        await writeSilentWav(silentWavPath, 8); // 8s covers max 6s clip + safety margin

        await runFFmpeg(
          ffmpeg()
            .input(localClipPaths[i])
            .input(silentWavPath)
            .complexFilter([
              `[0:v]${scaleFilter},eq=saturation=1.3:contrast=1.05[outv]`,
              '[1:a]aformat=sample_rates=44100:channel_layouts=stereo[outa]',
            ])
            .outputOptions([
              '-map [outv]',
              '-map [outa]',
              '-c:v libx264',
              '-c:a aac',
              '-pix_fmt yuv420p',
              '-r 24',
              '-ar 44100',
              '-ac 2',
              '-shortest',
              '-preset fast',
              '-movflags +faststart',
            ])
            .output(normalizedPath)
        );
      } else {
        // Clip has audio — apply scale + saturation boost and re-encode.
        await runFFmpeg(
          ffmpeg()
            .input(localClipPaths[i])
            .outputOptions([
              '-c:v libx264',
              '-c:a aac',
              '-pix_fmt yuv420p',
              '-r 24',
              '-ar 44100',
              '-ac 2',
              `-vf ${scaleFilter},eq=saturation=1.3:contrast=1.05`,
              '-preset fast',
              '-movflags +faststart',
            ])
            .output(normalizedPath)
        );
      }

      normalizedPaths.push(normalizedPath);
    }

    // Step 2: Concatenate using filter_complex.
    const outputPath = path.join(tempDir, `final-${Date.now()}.mp4`);
    const n = normalizedPaths.length;

    const inputSegments = normalizedPaths.map((_, i) => `[${i}:v][${i}:a]`).join('');
    const concatFilter = `${inputSegments}concat=n=${n}:v=1:a=1[outv][outa]`;

    let cmd = ffmpeg();
    for (const p of normalizedPaths) {
      cmd = cmd.input(p);
    }

    cmd = cmd
      .complexFilter([concatFilter])
      .outputOptions([
        '-map [outv]',
        '-map [outa]',
        '-c:v libx264',
        '-c:a aac',
        '-pix_fmt yuv420p',
        '-r 24',
        '-movflags +faststart',
        ...(targetDurationSeconds ? [`-t ${targetDurationSeconds}`] : []),
      ])
      .output(outputPath);

    console.log(`[FFmpeg] Concatenating ${n} clips (${orientation})...`);
    await runFFmpeg(cmd);

    const actualDur = await getDuration(outputPath);
    console.log(`[FFmpeg] Concatenated video duration: ${actualDur.toFixed(2)}s`);

    const finalUrl = await uploadFileToCloudinary(outputPath, `concat-${Date.now()}.mp4`);
    console.log('[FFmpeg] Concatenated video uploaded:', finalUrl);
    return finalUrl;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
