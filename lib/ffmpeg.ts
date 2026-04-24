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

// ─── Create Slideshow from images ─────────────────────────────────────────────

export async function createSlideshow(imageUrls: string[], scenes: any[]): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'adveo-slide-'));

  try {
    // Download all images
    const imagePaths: string[] = [];
    for (let i = 0; i < imageUrls.length; i++) {
      const filePath = path.join(tempDir, `shot-${i}.jpg`);
      await downloadFile(imageUrls[i], filePath);
      imagePaths.push(filePath);
    }

    // Build concat list — each image displayed for its scene duration
    const concatLines: string[] = [];
    for (let i = 0; i < imagePaths.length; i++) {
      const duration = scenes[i]?.duration || 4;
      concatLines.push(`file '${imagePaths[i].replace(/\\/g, '/')}'`);
      concatLines.push(`duration ${duration}`);
    }
    // FFmpeg requires the last frame repeated without duration
    concatLines.push(`file '${imagePaths[imagePaths.length - 1].replace(/\\/g, '/')}'`);

    const concatFile = path.join(tempDir, 'concat.txt');
    await fs.writeFile(concatFile, concatLines.join('\n'));

    const outputPath = path.join(tempDir, `slideshow-${Date.now()}.mp4`);

    // Create slideshow video
    await runFFmpeg(
      ffmpeg()
        .input(concatFile)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions([
          '-c:v libx264',
          '-pix_fmt yuv420p',
          '-vf scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black',
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

// ─── Merge Narration over Veo video (Veo audio = BGM @ 25%, narration @ 100%) ─

export async function mergeAudioVideo(
  videoUrl: string,
  audioUrl: string
): Promise<{ url: string; videoUrl: string; audioUrl: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'adveo-merge-'));

  try {
    const videoPath  = path.join(tempDir, 'video.mp4');
    const audioPath  = path.join(tempDir, 'narration.mp3');
    const outputPath = path.join(tempDir, `final-${Date.now()}.mp4`);

    console.log('[FFmpeg] Downloading video and narration...');
    await Promise.all([
      downloadFile(videoUrl, videoPath),
      downloadFile(audioUrl, audioPath),
    ]);

    const [videoDur, audioDur] = await Promise.all([
      getDuration(videoPath),
      getDuration(audioPath),
    ]);
    console.log(`[FFmpeg] Video: ${videoDur.toFixed(2)}s | Narration: ${audioDur.toFixed(2)}s`);

    // BUG FIX: target is driven by VIDEO length, not narration length.
    // Previously used audioDur which clamped the 18s video to ~12s (narration length).
    // Now: keep the full video duration. Narration plays, then BGM continues.
    // Clamp between 16s min and 22s max for ad safety.
    const targetDur = Math.min(Math.max(videoDur, 16), 22);
    console.log(`[FFmpeg] Target duration: ${targetDur.toFixed(2)}s (video-driven, not narration-driven)`);

    // Mix strategy:
    //   - Veo's own video audio track = scene-matched BGM at 25%
    //   - ElevenLabs narration = 100%
    //   - Loop video if somehow shorter than targetDur
    //   - Narration ends naturally; BGM fills remaining video
    await runFFmpeg(
      ffmpeg()
        .input(videoPath)
        .inputOptions(['-stream_loop -1'])   // loop video if shorter than narration
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

    const finalUrl = await uploadFileToCloudinary(outputPath, `final-${Date.now()}.mp4`);
    console.log('[FFmpeg] Final video with audio uploaded:', finalUrl);
    return { url: finalUrl, videoUrl, audioUrl };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

// ─── Concatenate Multiple Clips (robust filter_complex + saturation boost) ────

export async function concatenateClips(clipUrls: string[], targetDurationSeconds?: number): Promise<string> {
  if (!Array.isArray(clipUrls) || clipUrls.length === 0) {
    throw new Error('concatenateClips requires at least one clip URL');
  }

  if (clipUrls.length === 1) {
    return clipUrls[0];
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'adveo-concat-'));

  try {
    const localClipPaths: string[] = [];

    for (let i = 0; i < clipUrls.length; i++) {
      const localPath = path.join(tempDir, `clip-${i}.mp4`);
      console.log(`[FFmpeg] Downloading clip ${i + 1}/${clipUrls.length}:`, clipUrls[i]);
      await downloadFile(clipUrls[i], localPath);
      localClipPaths.push(localPath);
    }

    // Step 1: Normalize each clip to identical codec/fps/resolution.
    // This is critical — if clips have mismatched stream formats, the demuxer concat
    // silently drops audio or entire clips. Re-encoding guarantees compatibility.
    const normalizedPaths: string[] = [];
    for (let i = 0; i < localClipPaths.length; i++) {
      const normalizedPath = path.join(tempDir, `norm-${i}.mp4`);
      console.log(`[FFmpeg] Normalizing clip ${i + 1}/${localClipPaths.length}...`);

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
            // Saturation boost: corrects Veo's tendency to generate desaturated/B&W output.
            // eq=saturation=1.3 brings muted colors back to natural commercial vibrancy.
            // eq=contrast=1.05 adds slight punch without blowing highlights.
            '-vf eq=saturation=1.3:contrast=1.05',
            '-preset fast',
            '-movflags +faststart',
          ])
          .output(normalizedPath)
      );

      normalizedPaths.push(normalizedPath);
    }

    // Step 2: Concatenate using filter_complex — more robust than the concat demuxer.
    // filter_complex concat guarantees ALL clips are included, even if stream layouts differ.
    const outputPath = path.join(tempDir, `final-${Date.now()}.mp4`);
    const n = normalizedPaths.length;

    // Build the filter_complex concat string: [0:v][0:a][1:v][1:a]...concat=n=N:v=1:a=1[outv][outa]
    const inputSegments = normalizedPaths.map((_, i) => `[${i}:v][${i}:a]`).join('');
    const concatFilter = `${inputSegments}concat=n=${n}:v=1:a=1[outv][outa]`;

    let cmd = ffmpeg();
    for (const p of normalizedPaths) {
      cmd = cmd.input(p);
    }

    cmd = cmd.complexFilter([concatFilter]);

    cmd = cmd.outputOptions([
      '-map [outv]',
      '-map [outa]',
      '-c:v libx264',
      '-c:a aac',
      '-pix_fmt yuv420p',
      '-r 24',
      '-movflags +faststart',
      ...(targetDurationSeconds ? [`-t ${targetDurationSeconds}`] : []),
    ]).output(outputPath);

    console.log(`[FFmpeg] Concatenating ${n} clips with filter_complex...`);
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
