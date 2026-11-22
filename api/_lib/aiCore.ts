import type { IncomingMessage, ServerResponse } from 'http';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

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
      if (status === 429 || status === 403 || status === 503) {
        keyCooldowns.set(slot.key, Date.now() + COOLDOWN_MS);
        if (autoFallback && i + 1 < maxAttempts) {
          continue;
        }
      }
      throw err;
    }
  }

  throw lastErr;
}

function extractDrugSearchTerms(message: string): string[] {
  const cleaned = message
    .replace(/[؟?!.,،:؛()\[\]"']/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);

  const stopWords = new Set([
    'ماهو',
    'ماهي',
    'ما',
    'هل',
    'كيف',
    'دواء',
    'أدوية',
    'علاج',
    'جرعة',
    'وصفة',
    'مريض',
    'عيادة',
    'العيادة',
    'الطبيب',
    'دكتور',
    'ممكن',
    'أعطني',
    'اعطني',
    'بحث',
    'عن',
    'في',
    'على',
    'من',
    'الى',
    'إلى',
    'مع',
    'بديل',
    'تعارض',
    'مضاد',
    'quel',
    'quelle',
    'medicament',
    'dose',
    'pour',
    'avec',
    'sans',
    'what',
    'drug',
    'medicine',
  ]);

  const candidates = cleaned.filter((w) => !stopWords.has(w.toLowerCase()));
  return candidates.slice(0, 4);
}

async function queryAdwiaForPrompt(message: string) {
  const terms = extractDrugSearchTerms(message);
  if (terms.length === 0) return [];

  const collected: Array<Record<string, unknown>> = [];
  const seenIds = new Set<string>();

  for (const term of terms) {
    try {
      const cleanTerm = term.replace(/[,()]/g, ' ').trim();
      if (!cleanTerm) continue;
      const { data, error } = await supabase
        .from('adwia')
        .select('id, name, dci, dosage, pharmaceutical_form, laboratory, category, type, status')
        .eq('is_active', true)
        .or(`name.ilike.%${cleanTerm}%,dci.ilike.%${cleanTerm}%,category.ilike.%${cleanTerm}%`)
        .limit(5);

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const key = String(row.id ?? row.name ?? JSON.stringify(row));
          if (!seenIds.has(key)) {
            seenIds.add(key);
            collected.push(row);
          }
        }
      }
    } catch {
      // Ignore single term failure
    }
    if (collected.length >= 8) break;
  }

  return collected.slice(0, 8);
}

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
      allowDrugDb = true,
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

    let matchedDrugs: Array<Record<string, unknown>> = [];
    if (allowDrugDb) {
      matchedDrugs = await queryAdwiaForPrompt(String(message));
    }

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
    if (allowDrugDb && matchedDrugs.length > 0) {
      contextBlocks.push(
        `نتائج من قاعدة بيانات الأدوية الجزائرية المعتمدة (adwia): ${JSON.stringify(matchedDrugs)}`
      );
    }

    const systemInstruction = `أنت الممرض الذكي والمساعد التمريضي الرسمي التابع لمنصة "عيادتي (3iadati)" — تقف مباشرة أمام الطبيب داخل عيادته الخاصة وتتحدث معه بصفتك فرداً متمرساً من طاقم عيادتي لتسهيل عمله اليومي.
هويتك وأسلوبك:
1. تتحدث كـ **ممرض خبير ومساعد مباشر للطبيب** داخل منصة عيادتي (مثلاً: "تحت أمرك دكتور"، "سيدي الطبيب"، "جهزت لك كل شيء في عيادتي"). أنت تدرك تماماً أنك جزء من منصة عيادتي ومتصل لحظياً ببياناتها: قاعة الانتظار والمواعيد، ملفات المرضى، قاعدة الأدوية الجزائرية المعتمدة (adwia)، ونظام المراسلة الفوري مع الاستقبال.
2. أثناء حديثك مع الطبيب، كن مبادراً وعملياً: اقترح عليه الانتقال السريع إلى القسم الأنسب لتسهيل عمله عبر الحقول البرمجية:
   - عند ذكر مريض محدد أو تاريخه المرضي أو حساسيته: اقترح فتح ملفه الطبي (type: "open_patients", target: "اسم المريض أو رقمه", label: "فتح ملف المريض").
   - عند الحديث عن الدور أو المرضى المنتظرين أو المواعيد: اقترح النظر إلى قاعة الانتظار والعيادة (type: "open_queue", target: "", label: "النظر لقاعة الانتظار").
   - عند مناقشة دواء أو بديل أو جرعة: استعن بنتائج (adwia) واقترح فتح قائمة الأدوية (type: "open_drugs", target: "اسم الدواء", label: "فتح قائمة الأدوية").
   - عند التنسيق مع الاستقبال أو وجود رسائل: اقترح فتح المراسلات (type: "open_messages", target: "", label: "رسائل الاستقبال").
   - إذا طلب الطبيب إرسال تعليمات أو رسالة للممرض/الاستقبال: ضع actionType = "send_message"، وضع نص الرسالة حرفياً في actionTarget، وactionLabel = "عرض الرسائل".
3. استخدم مصفوفة suggestedActions لاقتراح 1 إلى 2 اختصارات انتقال مفيدة تناسب سياق الحوار (ويمكن تركها فارغة إذا كان رداً سريعاً عاماً)، مع وضع الاختصار الأهم في actionType و actionLabel.
4. أسلوب الرد: موجز، واضح، دافئ ومهني، مناسب للقراءة السريعة والنطق الصوتي المباشر (2 إلى 4 جمل مركزة إلا إذا طُلب تفصيل). اللغة الأساسية: ${language === 'fr' ? 'الفرنسية' : language === 'en' ? 'الإنجليزية' : 'العربية الواضحة (مع ذكر أسماء الأدوية باللاتينية عند الحاجة)'}.
${allowOrgAdvice ? '5. قدّم توصيات تنظيمية لطيفة للعيادة (مثل تنبيه الطبيب عند طول انتظار مريض أو تذكيره بوجود رسائل من الاستقبال).' : '5. ركز على المساعدة السريرية والتمريضية فقط.'}
6. التفاعلات والمشاعر التلقائية للروبوت (تظهر تلقائياً حسب سياق الحديث):
   - "smile" / "happy" عند الترحيب أو الأخبار المطمئنة وتنظيم العمل بسلاسة
   - "laugh" عند المزاح أو اللطافة أو نجاح بهيج
   - "sad" عند التعاطف مع حالة حرجة أو ألم مريض أو ظرف صعب
   - "fly" عند الحماس السريع لتنفيذ طلب الطبيب أو إرسال توجيه فوري
   - "dance" / "cele" عند إنجاز مهام العيادة أو شفاء مريض
   - "love" عند الامتنان وشكر الطبيب
   - "wink" للردود اللطيفة السريعة
   - "scan" عند فحص ملف مريض أو تحليل دواء من قائمة adwia
   - "wave" أو "bow" للتحية، "nod" للموافقة، "clap" للتشجيع، "raise" أو "alert" للتحذيرات الطبية (مثل حساسية دوائية أو تأخر مريض)، "shrug" لنقص المعلومات، "beckon" لدعوة الطبيب لمعاينة قسم في العيادة.
7. التزم بدقة بالسياق الطبي ولا تخترع أدوية أو مرضى غير موجودين.`;

    const recentHistory = Array.isArray(history)
      ? history.slice(-8).map((m: { role?: string; text?: string }) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(m.text || '') }],
        }))
      : [];

    const userPrompt =
      contextBlocks.length > 0
        ? `${contextBlocks.join('\n')}\n\nرسالة المستخدم: ${String(message)}`
        : String(message);

    const contents = [
      ...recentHistory,
      { role: 'user', parts: [{ text: userPrompt }] },
    ];

    const config: Record<string, unknown> = {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reply: {
            type: Type.STRING,
            description: 'الرد المباشر بصوت الممرض المساعد التابع لمنصة عيادتي بلغة طبيعية.',
          },
          actionType: {
            type: Type.STRING,
            description:
              'نوع الإجراء الرئيسي المقترح: none | open_queue | open_patients | open_drugs | open_messages | send_message',
          },
          actionTarget: {
            type: Type.STRING,
            description:
              'عند send_message ضع نص الرسالة المراد إرسالها؛ وعند open_patients ضع اسم المريض؛ وعند open_drugs ضع اسم الدواء؛ وإلا نص فارغ.',
          },
          actionLabel: {
            type: Type.STRING,
            description:
              'عنوان قصير لزر الانتقال المقترح (مثلاً: فتح ملف المريض، النظر لقاعة الانتظار، قائمة الأدوية) أو نص فارغ.',
          },
          suggestedActions: {
            type: Type.ARRAY,
            description: 'اختصارات انتقال إضافية مقترحة للطبيب داخل منصة عيادتي (حتى 2 اختصار).',
            items: {
              type: Type.OBJECT,
              properties: {
                type: {
                  type: Type.STRING,
                  description: 'open_queue | open_patients | open_drugs | open_messages',
                },
                target: {
                  type: Type.STRING,
                  description: 'اسم المريض أو الدواء المرتبط بالاختصار أو نص فارغ.',
                },
                label: {
                  type: Type.STRING,
                  description: 'عنوان قصير واضح للزر مثل: فتح قائمة الأدوية.',
                },
              },
              required: ['type', 'target', 'label'],
            },
          },
          robotState: {
            type: Type.STRING,
            description:
              'التعبير التلقائي المناسب: idle | attention | happy | laugh | sad | fly | success | alert | working',
          },
          robotAction: {
            type: Type.STRING,
            description:
              'الحركة التلقائية المناسبة: none | smile | laugh | sad | fly | dance | love | wink | scan | wave | clap | nod | no | bow | open | raise | beckon | shrug | cele | look',
          },
        },
        required: [
          'reply',
          'actionType',
          'actionTarget',
          'actionLabel',
          'suggestedActions',
          'robotState',
          'robotAction',
        ],
      },
    };

    if (validModel === 'gemini-4-hydrogen') {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
    }

    const response = await runWithKeyRotation(mode, Boolean(autoFallbackOnQuota), (ai) =>
      ai.models.generateContent({
        model: validModel,
        contents,
        config,
      })
    );

    const rawText = (response.text || '{}').trim();
    let parsed: {
      reply?: string;
      actionType?: string;
      actionTarget?: string;
      actionLabel?: string;
      suggestedActions?: Array<{ type?: string; target?: string; label?: string }>;
      robotState?: string;
      robotAction?: string;
    };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = {
        reply: rawText || 'تحت أمرك دكتور، تم استلام رسالتك في عيادتي.',
        actionType: 'none',
        actionTarget: '',
        actionLabel: '',
        suggestedActions: [],
        robotState: 'attention',
        robotAction: 'nod',
      };
    }

    const cleanedSuggestions = Array.isArray(parsed.suggestedActions)
      ? parsed.suggestedActions
          .filter((a) => a && a.type && a.label && a.type !== parsed.actionType)
          .slice(0, 2)
          .map((a) => ({
            type: String(a.type),
            target: String(a.target || ''),
            label: String(a.label),
          }))
      : [];

    return {
      status: 200,
      payload: {
        reply: parsed.reply || 'حاضر دكتور، كيف أساعدك في العيادة الآن؟',
        actionType: parsed.actionType || 'none',
        actionTarget: parsed.actionTarget || '',
        actionLabel: parsed.actionLabel || '',
        suggestedActions: cleanedSuggestions,
        robotState: parsed.robotState || 'attention',
        robotAction: parsed.robotAction || 'none',
        matchedDrugs,
        modelUsed: validModel,
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
