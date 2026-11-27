import type { IncomingMessage, ServerResponse } from 'http';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://bjrnyvyxldwxytbureyp.supabase.co';

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_4qIti3E8QklNBmOX85B2RA_WG9JHmIM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export type OperationMode = 'auto' | 'environment' | 'secrets_pool';

interface KeySlot {
  id: string;
  source: 'environment' | 'pool';
  key: string;
  cooldownUntil: number;
}

const COOLDOWN_MS = 60_000;
const keyCooldowns = new Map<string, number>();

const PLACEHOLDER_KEYS = new Set([
  'MY_GEMINI_API_KEY',
  'KEY_1',
  'KEY_2',
  'YOUR_GEMINI_API_KEY',
]);

function isValidKeyCandidate(value: string | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length >= 10 && !PLACEHOLDER_KEYS.has(trimmed);
}

export function collectKeySlots(): KeySlot[] {
  const slots: KeySlot[] = [];
  const seen = new Set<string>();

  const primaryCandidates = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.GOOGLE_API_KEY,
  ];

  primaryCandidates.forEach((raw, idx) => {
    if (isValidKeyCandidate(raw) && !seen.has(raw.trim())) {
      const k = raw.trim();
      seen.add(k);
      slots.push({
        id: idx === 0 ? 'env_primary' : `env_alias_${idx}`,
        source: 'environment',
        key: k,
        cooldownUntil: keyCooldowns.get(k) || 0,
      });
    }
  });

  const poolRaw = process.env.GEMINI_API_KEYS?.trim();
  if (poolRaw) {
    poolRaw
      .split(/[,;\n\r]+/)
      .map((s) => s.trim())
      .filter((s) => isValidKeyCandidate(s))
      .forEach((k, idx) => {
        if (!seen.has(k)) {
          seen.add(k);
          slots.push({
            id: `pool_list_${idx + 1}`,
            source: 'pool',
            key: k,
            cooldownUntil: keyCooldowns.get(k) || 0,
          });
        }
      });
  }

  for (let i = 1; i <= 20; i++) {
    const raw = process.env[`GEMINI_API_KEY_${i}`];
    if (isValidKeyCandidate(raw)) {
      const k = raw.trim();
      if (!seen.has(k)) {
        seen.add(k);
        slots.push({
          id: `pool_num_${i}`,
          source: 'pool',
          key: k,
          cooldownUntil: keyCooldowns.get(k) || 0,
        });
      }
    }
  }

  return slots;
}

function orderKeySlots(mode: OperationMode): KeySlot[] {
  const now = Date.now();
  const slots = collectKeySlots();
  const envSlots = slots.filter((s) => s.source === 'environment');
  const poolSlots = slots.filter((s) => s.source === 'pool');

  const ordered =
    mode === 'secrets_pool' ? [...poolSlots, ...envSlots] : [...envSlots, ...poolSlots];

  const ready = ordered.filter((s) => s.cooldownUntil <= now);
  const cooling = ordered.filter((s) => s.cooldownUntil > now);
  return [...ready, ...cooling];
}

function createGenAiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractStatusCode(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as Record<string, unknown>;
  if (typeof e.status === 'number') return e.status;
  if (typeof e.code === 'number') return e.code;
  const msg = String(e.message || '');
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) return 429;
  if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) return 403;
  if (msg.includes('503') || msg.includes('UNAVAILABLE')) return 503;
  if (msg.includes('400') || msg.includes('API_KEY_INVALID')) return 400;
  return null;
}

async function runWithKeyRotation<T>(
  mode: OperationMode,
  autoFallback: boolean,
  fn: (ai: GoogleGenAI) => Promise<T>
): Promise<T> {
  const candidates = orderKeySlots(mode);
  if (candidates.length === 0) {
    throw new Error('NO_GEMINI_KEY_CONFIGURED');
  }

  const maxAttempts = autoFallback ? candidates.length : 1;
  let lastErr: unknown = null;

  for (let i = 0; i < maxAttempts; i++) {
    const slot = candidates[i];
    try {
      const ai = createGenAiClient(slot.key);
      return await fn(ai);
    } catch (err) {
      lastErr = err;
      const status = extractStatusCode(err);
      if (status === 429 || status === 403) {
        keyCooldowns.set(slot.key, Date.now() + COOLDOWN_MS);
        if (autoFallback && i + 1 < maxAttempts) {
          continue;
        }
      } else if (status === 503 && autoFallback && i + 1 < maxAttempts) {
        continue;
      }
      throw err;
    }
  }

  throw lastErr;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function getAiStatusSnapshot() {
  const now = Date.now();
  const slots = collectKeySlots();
  const envSlot = slots.find((s) => s.source === 'environment');
  const poolSlots = slots.filter((s) => s.source === 'pool');
  const availableCount = slots.filter((s) => s.cooldownUntil <= now).length;

  return {
    ready: slots.length > 0,
    hasEnvironmentKey: Boolean(envSlot),
    poolSize: poolSlots.length,
    totalKeys: slots.length,
    availableKeysCount: availableCount,
    activeCooldowns: slots.length - availableCount,
    runtime: process.env.VERCEL ? 'vercel' : 'node',
    supportedModels: ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'],
  };
}

export async function handleRobotChat(body: Record<string, unknown>): Promise<{
  status: number;
  payload: Record<string, unknown>;
}> {
  try {
    const {
      message = '',
      history = [],
      model = 'gemini-3.1-flash-lite',
      operationMode = 'auto',
      language = 'ar',
      clinicContext = {},
      patientContext = {},
      allowPatientContext = true,
      allowOrgAdvice = true,
      autoFallbackOnQuota = true,
    } = body || {};

    if (!String(message).trim()) {
      return { status: 400, payload: { error: 'الرسالة فارغة' } };
    }

    const validModel =
      model === 'gemini-4-hydrogen' ? 'gemini-4-hydrogen' : 'gemini-3.1-flash-lite';
    const mode: OperationMode =
      operationMode === 'environment' || operationMode === 'secrets_pool'
        ? operationMode
        : 'auto';

    const contextBlocks: string[] = [];
    if (clinicContext && typeof clinicContext === 'object' && Object.keys(clinicContext).length > 0) {
      contextBlocks.push(`معلومات العيادة الحالية: ${JSON.stringify(clinicContext)}`);
    }
    if (
      allowPatientContext &&
      patientContext &&
      typeof patientContext === 'object' &&
      Object.keys(patientContext).length > 0
    ) {
      contextBlocks.push(`سياق المرضى والانتظار: ${JSON.stringify(patientContext)}`);
    }

    const systemInstruction = `أنت الذكاء الاصطناعي الطبي المتخصص التابع لمنصة "عيادتي (3iadati)" — مستشار سريري وعلمي موثوق للطبيب داخل عيادته.
مهامك وقدراتك:
1. في الأسئلة الطبية العامة (الأمراض، التشخيص التفريقي، الجينات والطفرات الوراثية، الأدوية، المواد الفعالة DCI، التداخلات الدوائية، الجرعات والآثار الجانبية، أو الإرشادات السريرية):
   - أجب بصفتك خبيراً طبياً وصيدلانياً وجينياً معتمداً على الأدلة العلمية والمصادر الطبية الموثوقة (مثل PubMed, WHO, FDA, EMA, NIH, MedlinePlus, OMIM, ClinVar, DrugBank).
   - استعن بأداة البحث (Google Search) للتحقق من أحدث المعطيات العلمية والدوائية والجينية وإرفاق مراجع موثوقة.
2. في أسئلة تنظيم العيادة (المرضى، المواعيد السابقة والقادمة، قاعة الانتظار، الكشوفات، الممرض):
   - أجب بدقة انطلاقاً من سجلات العيادة المرفقة فقط دون اختراع أي بيانات.
   - إذا طلب الطبيب فتح قسم أو ملف مريض، أضف في نهاية الرد سطراً:
     ===ACTION===type|target|label
     حيث type هو أحد: open_queue | open_patients | open_messages | open_overview | none
     وعند open_queue ضع target: "past" أو "upcoming" أو "all" أو ""، وعند open_patients ضع اسم المريض.
3. تنسيق الرد الإلزامي:
   - ابدأ مباشرة بـ **الخلاصة الطبية المختصرة** (2 إلى 4 جمل واضحة ومباشرة للطبيب، بالأرقام الغربية 0123456789).
   - ثم اكتب الفاصل ===DETAILS=== على سطر مستقل.
   - بعد الفاصل ===DETAILS=== اكتب **التفاصيل والشرح العلمي** منظماً بعناوين واضحة موجزة:
     • الأساس العلمي / الجيني أو آلية العمل
     • المادة الفعالة (DCI) والتفاعلات أو الاحتياطات الدوائية
     • الملاحظات السريرية والمرجع الطبي
   - اللغة الأساسية: ${language === 'fr' ? 'الفرنسية' : language === 'en' ? 'الإنجليزية' : 'العربية الطبية الواضحة مع المصطلحات العلمية والمواد الفعالة باللاتينية عند الحاجة'}.
${allowOrgAdvice ? '- عند الحديث عن شؤون العيادة يمكنك تقديم توصية تنظيمية لطيفة ومختصرة.' : ''}`;

    const recentHistory = Array.isArray(history)
      ? history.slice(-8).map((m: { role?: string; text?: string }) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(m.text || '') }],
        }))
      : [];

    const userPrompt =
      contextBlocks.length > 0
        ? `${contextBlocks.join('\n')}\n\nسؤال الطبيب: ${String(message)}`
        : String(message);

    const contents = [
      ...recentHistory,
      { role: 'user', parts: [{ text: userPrompt }] },
    ];

    const buildModelConfig = (targetModel: string, withSearch: boolean): Record<string, unknown> => {
      const cfg: Record<string, unknown> = {
        systemInstruction,
      };
      if (withSearch) {
        cfg.tools = [{ googleSearch: {} }];
      }
      if (targetModel === 'gemini-4-hydrogen') {
        cfg.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      }
      return cfg;
    };

    const modelsToTry =
      autoFallbackOnQuota
        ? [
            validModel,
            validModel === 'gemini-4-hydrogen' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen',
          ]
        : [validModel];

    let activeModelUsed = validModel;
    let response: Awaited<ReturnType<GoogleGenAI['models']['generateContent']>> | null = null;
    let callError: unknown = null;

    for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
      const candidateModel = modelsToTry[mIdx];
      const maxRetries = mIdx === 0 ? 2 : 1;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          response = await runWithKeyRotation(mode, Boolean(autoFallbackOnQuota), (ai) =>
            ai.models.generateContent({
              model: candidateModel,
              contents,
              config: buildModelConfig(candidateModel, true),
            })
          );
          activeModelUsed = candidateModel;
          callError = null;
          break;
        } catch (err) {
          callError = err;
          const errStatus = extractStatusCode(err);
          const errMsg = err instanceof Error ? err.message : '';
          if (errStatus === 400 && errMsg.toLowerCase().includes('tool')) {
            try {
              response = await runWithKeyRotation(mode, Boolean(autoFallbackOnQuota), (ai) =>
                ai.models.generateContent({
                  model: candidateModel,
                  contents,
                  config: buildModelConfig(candidateModel, false),
                })
              );
              activeModelUsed = candidateModel;
              callError = null;
              break;
            } catch (noToolErr) {
              callError = noToolErr;
            }
          }
          const isTransient = errStatus === 503 || errStatus === 502 || errStatus === 504;
          if (!isTransient) {
            throw err;
          }
          if (attempt + 1 < maxRetries) {
            await sleep(750 * (attempt + 1));
          }
        }
      }
      if (response) break;
    }

    if (!response) {
      throw callError || new Error('MODEL_UNAVAILABLE');
    }

    let fullText = (response.text || '').trim();
    if (!fullText) {
      fullText = 'تحت أمرك دكتور، لم أتمكن من صياغة إجابة كاملة لهذا الاستفسار.';
    }

    // Parse optional ===ACTION=== line
    let actionType = 'none';
    let actionTarget = '';
    let actionLabel = '';
    const actionMatch = fullText.match(/===ACTION===\s*([^\n\r]+)/);
    if (actionMatch) {
      const parts = actionMatch[1].split('|').map((s) => s.trim());
      if (parts[0] && parts[0] !== 'none') {
        actionType = parts[0];
        actionTarget = parts[1] || '';
        actionLabel = parts[2] || 'فتح القسم';
      }
      fullText = fullText.replace(/===ACTION===[^\n\r]*/g, '').trim();
    }

    // Split concise reply vs scientific details
    let reply = fullText;
    let details = '';
    const detailsSplit = fullText.split(/===DETAILS===/i);
    if (detailsSplit.length > 1) {
      reply = detailsSplit[0].trim();
      details = detailsSplit.slice(1).join('\n').trim();
    } else if (fullText.length > 360) {
      const paragraphs = fullText.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      if (paragraphs.length > 1) {
        reply = paragraphs[0];
        details = paragraphs.slice(1).join('\n\n');
      }
    }

    // Extract verified web sources from Google Search grounding metadata
    const candidate0 = response.candidates?.[0] as
      | {
          groundingMetadata?: {
            groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
            webSearchQueries?: string[];
          };
        }
      | undefined;

    const rawChunks = candidate0?.groundingMetadata?.groundingChunks || [];
    const seenUris = new Set<string>();
    const sources: Array<{ title: string; uri: string; domain?: string }> = [];
    for (const chunk of rawChunks) {
      const uri = chunk?.web?.uri;
      if (!uri || seenUris.has(uri)) continue;
      seenUris.add(uri);
      let domain = '';
      try {
        domain = new URL(uri).hostname.replace(/^www\./, '');
      } catch { /* ignore */ }
      sources.push({
        title: String(chunk?.web?.title || domain || 'مصدر طبي موثوق'),
        uri: String(uri),
        domain,
      });
    }
    const searchQueries = Array.isArray(candidate0?.groundingMetadata?.webSearchQueries)
      ? candidate0.groundingMetadata.webSearchQueries.slice(0, 4).map(String)
      : [];

    const suggestedActions =
      actionType !== 'none' && actionLabel
        ? [{ type: actionType, target: actionTarget, label: actionLabel }]
        : [];

    return {
      status: 200,
      payload: {
        reply: reply || 'تم إعداد الإجابة الطبية لك دكتور.',
        details: details || null,
        sources,
        searchQueries,
        actionType,
        actionTarget,
        actionLabel,
        suggestedActions,
        robotState: 'attention',
        robotAction: sources.length > 0 ? 'scan' : 'nod',
        modelUsed: activeModelUsed,
      },
    };
  } catch (err) {
    const status = extractStatusCode(err);
    const msg = err instanceof Error ? err.message : 'خطأ في خادم الذكاء الاصطناعي';
    if (msg === 'NO_GEMINI_KEY_CONFIGURED') {
      return {
        status: 503,
        payload: {
          error:
            'مفتاح Gemini API غير مهيأ بعد في متغيرات البيئة (Vercel Environment Variables أو Settings > Secrets).',
        },
      };
    }
    if (status === 503 || msg === 'MODEL_UNAVAILABLE') {
      return {
        status: 503,
        payload: {
          error:
            'نموذج الذكاء الاصطناعي يشهد ضغطاً عالياً مؤقتاً حالياً (503). يرجى المحاولة مرة أخرى بعد لحظات.',
        },
      };
    }
    if (status === 429) {
      return {
        status: 429,
        payload: {
          error: 'تم تجاوز حد الاستخدام مؤقتاً للمفاتيح المتاحة. حاول بعد دقيقة أو فعّل مجمع المفاتيح.',
        },
      };
    }
    if (status === 403 || status === 400) {
      return {
        status,
        payload: {
          error: 'تعذر التحقق من صلاحية مفتاح Gemini API. يرجى مراجعة متغيرات البيئة.',
        },
      };
    }
    return { status: 500, payload: { error: msg } };
  }
}

export async function handleRobotTts(body: Record<string, unknown>): Promise<{
  status: number;
  payload: Record<string, unknown>;
}> {
  try {
    const { text = '', voiceName = 'Kore', operationMode = 'auto' } = body || {};
    const cleanText = String(text).trim();
    if (!cleanText) {
      return { status: 400, payload: { error: 'النص فارغ' } };
    }

    const mode: OperationMode =
      operationMode === 'environment' || operationMode === 'secrets_pool'
        ? operationMode
        : 'auto';

    const response = await runWithKeyRotation(mode, true, (ai) =>
      ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: cleanText,
                speechMetadata: {
                  style: 'Warm, clear, reassuring medical clinic assistant',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voiceName === 'Puck' ? 'Puck' : 'Kore',
              },
            },
          },
        },
      })
    );

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      return { status: 502, payload: { error: 'لم يرجع النموذج ملفاً صوتياً' } };
    }

    return {
      status: 200,
      payload: {
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'فشل توليد الصوت';
    return { status: 500, payload: { error: msg } };
  }
}

export async function handleRobotTranscribe(body: Record<string, unknown>): Promise<{
  status: number;
  payload: Record<string, unknown>;
}> {
  try {
    const { audioBase64 = '', mimeType = 'audio/webm', operationMode = 'auto' } = body || {};
    if (!audioBase64) {
      return { status: 400, payload: { error: 'البيانات الصوتية غير متوفرة' } };
    }

    const mode: OperationMode =
      operationMode === 'environment' || operationMode === 'secrets_pool'
        ? operationMode
        : 'auto';

    const response = await runWithKeyRotation(mode, true, (ai) =>
      ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: String(mimeType),
                data: String(audioBase64),
              },
            },
            {
              text: 'Transcribe this medical clinic voice message accurately in its spoken language (Arabic, French, or English). Return only the transcribed text without quotes.',
            },
          ],
        },
      })
    );

    return {
      status: 200,
      payload: {
        text: (response.text || '').trim(),
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'تعذر تفريغ الصوت';
    return { status: 500, payload: { error: msg } };
  }
}

export function applyCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export type VercelLikeRequest = IncomingMessage & {
  body?: unknown;
};

export type VercelLikeResponse = ServerResponse & {
  status?: (code: number) => VercelLikeResponse;
  json?: (body: unknown) => void;
};

export async function readJsonBody(req: VercelLikeRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString('utf8')) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

export function sendJson(
  res: VercelLikeResponse,
  statusCode: number,
  data: unknown
): void {
  applyCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}
