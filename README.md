# Adveo Frontend

Adveo is an AI ad-creation app that turns one product image into a short, cinematic marketing video.

The app generates:

- a structured 3-scene ad concept with narrative arc
- Veo-powered video clips using product-aware prompts
- ElevenLabs voiceover
- final merged output with ambient + narration audio

## Tech Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Prisma + PostgreSQL
- OpenAI (concept and image analysis)
- Vertex AI Veo (video generation)
- ElevenLabs (voice generation)
- Cloudinary (asset hosting)
- FFmpeg via fluent-ffmpeg (media merge/concat)

## Key Product Flow

1. User uploads a product image via /api/upload.
2. /api/generate creates or accepts a script JSON and creates a Project row.
3. Pipeline starts in background (startPipeline).
4. Pipeline analyzes product image (OpenAI vision), then generates Veo video.
5. Pipeline generates voiceover (ElevenLabs), merges with FFmpeg, saves final URL.
6. Frontend polls /api/status/[id] until done/error.

## Project Structure

- app: Next.js pages and API routes
- app/api/generate: starts generation and pipeline
- app/api/status/[id]: polls job status
- app/api/upload: uploads files to Cloudinary
- app/api/draft: ideation and draft script generation
- lib/ai.ts: ad concept schemas, prompting, image analysis
- lib/pipeline.ts: orchestration for script/video/audio/finalization
- lib/veo.ts: Vertex AI Veo integration
- lib/elevenlabs.ts: TTS generation
- lib/ffmpeg.ts: media merging and concatenation helpers
- lib/storage.ts: Cloudinary upload utilities
- prisma/schema.prisma: data model (Project, AdPattern)
- scripts: integration checks and seed utilities

## Prerequisites

- Node.js 20+
- npm or pnpm
- PostgreSQL database
- FFmpeg installed and available in PATH

## Environment Variables

Create .env in frontend using .env.example as a base:

- DATABASE_URL: PostgreSQL connection string
- OPENAI_API_KEY: OpenAI key used for concept and image analysis
- ELEVENLABS_API_KEY: ElevenLabs TTS key
- CLOUDINARY_CLOUD_NAME: Cloudinary cloud name
- CLOUDINARY_API_KEY: Cloudinary API key
- CLOUDINARY_API_SECRET: Cloudinary API secret
- GOOGLE_APPLICATION_CREDENTIALS: path to Google service account JSON
- GOOGLE_CLOUD_PROJECT_ID: Google Cloud project id
- GOOGLE_CLOUD_LOCATION: Vertex region (default us-central1)
- VEO_RESOLUTION: optional Veo output resolution override
- VEO_GENERATE_AUDIO: set false to disable Veo ambient audio generation
- VEO_STORAGE_URI: optional GCS URI for Veo outputs

## Local Setup

From frontend:

1. Install dependencies.
2. Configure .env.
3. Run Prisma migrations (or db push if your local migration history is drifted).
4. Start development server.

Example:

```bash
cd frontend
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

If migration drift exists locally, use:

```bash
npx prisma db push
```

## Available Commands

- npm run dev: start local development server
- npm run build: production build
- npm run start: run production server
- npm run lint: run eslint

Useful script checks:

- npx tsx scripts/test-services.ts: ElevenLabs + Cloudinary integration check
- npx tsx scripts/test-vertex-auth.ts: Vertex auth and Imagen endpoint check
- npx tsx scripts/seed-patterns.ts: seed AdPattern rows

## API Routes

- POST /api/upload: uploads input image to Cloudinary and returns URL
- POST /api/generate: generates/accepts ad script, creates project, starts pipeline
- GET /api/status/[id]: returns pipeline status and output URL/error
- GET /api/projects: list projects ordered by createdAt
- POST /api/draft/ideation: one-paragraph ideation JSON
- POST /api/draft/script: draft script/scene expansion from ideation
- POST /api/generate/step3: step-3-only Veo test route

## Database Models

- Project:
	- tracks generation status, scriptJson, selected voiceId, final video URL, and errors
- AdPattern:
	- stores optional winning creative patterns by category + theme

## Pipeline Status Values

Project status can move through:

- processing
- script
- shots
- video
- audio
- finalizing
- done
- error

UI polling maps these to user-friendly labels in lib/db.ts.

## Notes And Caveats

- Next config currently has typescript.ignoreBuildErrors enabled.
- Veo integration uses Vertex service account auth, not consumer API keys.
- Product image analysis is used to enrich prompts for visual consistency.
- Voice is generated from fullScript in concept.voiceoverScript.
- Final media assembly depends on FFmpeg availability.

## Troubleshooting

- Upload failures:
	- verify Cloudinary credentials and account limits
- Veo generation failures:
	- verify GOOGLE_APPLICATION_CREDENTIALS path and project/region vars
- No narration in final video:
	- check ELEVENLABS_API_KEY and script fullScript content
- Prisma errors:
	- confirm DATABASE_URL and run npx prisma generate
- FFmpeg errors:
	- ensure ffmpeg and ffprobe are installed and in PATH

## License

No license file is currently defined in this package.
