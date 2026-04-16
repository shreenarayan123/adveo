import { uploadFileToCloudinary } from './storage';
import fs from 'fs/promises';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import os from 'os';

// Royalty-free background music (CC0 licensed)
const BGM_URL = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

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

// ─── Merge Audio + Video + BGM ────────────────────────────────────────────────

export async function mergeAudioVideo(
  videoUrl: string,
  audioUrl: string
): Promise<{ url: string; videoUrl: string; audioUrl: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'adveo-merge-'));

  try {
    const videoPath = path.join(tempDir, 'video.mp4');
    const audioPath = path.join(tempDir, 'audio.mp3');
    const bgmPath   = path.join(tempDir, 'bgm.mp3');
    const outputPath = path.join(tempDir, `final-${Date.now()}.mp4`);

    console.log('[FFmpeg] Downloading video and audio...');
    await Promise.all([
      downloadFile(videoUrl, videoPath),
      downloadFile(audioUrl, audioPath),
    ]);

    // Get both durations
    const [videoDur, audioDur] = await Promise.all([
      getDuration(videoPath),
      getDuration(audioPath),
    ]);
    console.log(`[FFmpeg] Video: ${videoDur.toFixed(2)}s | Audio: ${audioDur.toFixed(2)}s`);

    // Target duration = audio length (narration is the true pace)
    const targetDur = Math.min(Math.max(audioDur, 12), 20);

    // Try to download BGM; if it fails, proceed without it
    let hasBgm = false;
    try {
      await downloadFile(BGM_URL, bgmPath);
      hasBgm = true;
      console.log('[FFmpeg] BGM downloaded successfully');
    } catch (e) {
      console.warn('[FFmpeg] Could not download BGM, continuing without it');
    }

    if (hasBgm) {
      // Mix narration (full volume) + BGM (15% volume), loop BGM to fill duration, trim to targetDur
      await runFFmpeg(
        ffmpeg()
          .input(videoPath)
          .inputOptions([`-stream_loop -1`]) // loop video if shorter than audio
          .input(audioPath)
          .input(bgmPath)
          .inputOptions([`-stream_loop -1`]) // loop BGM to fill duration
          .complexFilter([
            // Mix narration at 100% + BGM at 15%
            `[1:a]volume=1.0[narration]`,
            `[2:a]volume=0.15[bgm]`,
            `[narration][bgm]amix=inputs=2:duration=shortest[mixed_audio]`,
          ])
          .outputOptions([
            `-map 0:v`,
            `-map [mixed_audio]`,
            `-c:v copy`,
            `-c:a aac`,
            `-b:a 192k`,
            `-t ${targetDur}`,   // trim to target duration
            `-movflags +faststart`,
          ])
          .output(outputPath)
      );
    } else {
      // No BGM — just merge video + narration, loop video if shorter
      await runFFmpeg(
        ffmpeg()
          .input(videoPath)
          .inputOptions([`-stream_loop -1`])
          .input(audioPath)
          .outputOptions([
            `-map 0:v`,
            `-map 1:a`,
            `-c:v copy`,
            `-c:a aac`,
            `-b:a 192k`,
            `-t ${targetDur}`,
            `-movflags +faststart`,
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
