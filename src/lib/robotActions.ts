import type { RobotState } from '../types/robot';
import type { RobotOutfitItem, RobotTheme } from './robotPreferences';

export type RobotAction =
  | 'wave'
  | 'clap'
  | 'nod'
  | 'no'
  | 'bow'
  | 'open'
  | 'raise'
  | 'beckon'
  | 'shrug'
  | 'cele'
  | 'look'
  | 'smile'
  | 'laugh'
  | 'sad'
  | 'fly'
  | 'dance'
  | 'wink'
  | 'love'
  | 'scan';

export type RobotHand = 'L' | 'R';
export type RobotExpressionOverride = RobotState | 'flat' | 'wink';
export type RobotEffectName = 'sparkles' | 'thruster' | 'tear' | 'love' | 'scan' | null;

export interface RobotActionDriver {
  setExpression: (expr: RobotExpressionOverride) => void;
  setArm: (side: RobotHand, rotateDeg?: number, tx?: number, ty?: number, tip?: boolean) => void;
  setHead: (rotateDeg?: number, x?: number, y?: number) => void;
  setGaze: (x?: number, y?: number) => void;
  setBodyTransform: (transform: string) => void;
  setEffect?: (effect: RobotEffectName) => void;
  rest: () => void;
}

export interface RobotActionDescriptor {
  id: RobotAction;
  label: { ar: string; fr: string; en: string };
  phrase: { ar: string; fr: string; en: string };
  hint: { ar: string; fr: string; en: string };
}

export const ROBOT_ACTIONS_LIST: RobotActionDescriptor[] = [
  { id: 'smile', label: { ar: 'ابتسامة', fr: 'Sourire', en: 'Smile' }, phrase: { ar: 'سعيد جداً بخدمتك!', fr: 'Ravi de vous aider !', en: 'Happy to help!' }, hint: { ar: 'تفاعل لطيف وترحيبي', fr: 'Sourire chaleureux', en: 'Warm smile' } },
  { id: 'laugh', label: { ar: 'ضحك', fr: 'Rire', en: 'Laugh' }, phrase: { ar: 'هاهاها! هذا رائع!', fr: 'Hahaha ! Génial !', en: 'Hahaha! Awesome!' }, hint: { ar: 'ضحك وبهجة مع شرارات مضيئة', fr: 'Rire joyeux', en: 'Cheerful laugh' } },
  { id: 'sad', label: { ar: 'حزن', fr: 'Triste', en: 'Sad' }, phrase: { ar: 'أشعر بالأسف لذلك...', fr: 'Je suis désolé...', en: 'I feel sorry...' }, hint: { ar: 'تعاطف وحزن لطيف', fr: 'Empathie', en: 'Empathy & sadness' } },
  { id: 'fly', label: { ar: 'طيران', fr: 'Voler', en: 'Fly' }, phrase: { ar: 'أحلّق في العيادة الآن!', fr: 'Je vole !', en: 'Taking flight!' }, hint: { ar: 'إقلاع وطيران بمحركات مضيئة', fr: 'Vol stationnaire', en: 'Hover & fly' } },
  { id: 'dance', label: { ar: 'رقص', fr: 'Danser', en: 'Dance' }, phrase: { ar: 'احتفال بالنشاط والإنجاز!', fr: 'On danse !', en: 'Celebration dance!' }, hint: { ar: 'رقصة إيقاعية مبهجة', fr: 'Danse rythmique', en: 'Joyful dance' } },
  { id: 'love', label: { ar: 'محبة', fr: 'Cœur', en: 'Love' }, phrase: { ar: 'شكراً لك يا دكتور!', fr: 'Merci beaucoup !', en: 'Much appreciated!' }, hint: { ar: 'تأثير القلوب والامتنان', fr: 'Cœurs flottants', en: 'Floating hearts' } },
  { id: 'wink', label: { ar: 'غمزة', fr: 'Clin d’œil', en: 'Wink' }, phrase: { ar: 'اعتمد عليّ دائماً!', fr: 'Compte sur moi !', en: 'Count on me!' }, hint: { ar: 'غمزة ذكية وسريعة', fr: 'Clin d’œil complice', en: 'Playful wink' } },
  { id: 'scan', label: { ar: 'فحص ليزر', fr: 'Scan médical', en: 'Medical Scan' }, phrase: { ar: 'جاري المسح والتدقيق الطبي...', fr: 'Analyse médicale...', en: 'Running medical scan...' }, hint: { ar: 'شعاع مسح ضوئي طبي', fr: 'Faisceau d’analyse', en: 'Visor scanner beam' } },
  { id: 'wave', label: { ar: 'تحية', fr: 'Saluer', en: 'Wave' }, phrase: { ar: 'أحيّيك بيدي', fr: 'Bonjour !', en: 'Hello there!' }, hint: { ar: 'عند دخول الطبيب أو وصول مريض', fr: 'Accueil du médecin', en: 'Doctor greeting' } },
  { id: 'clap', label: { ar: 'تصفيق', fr: 'Applaudir', en: 'Clap' }, phrase: { ar: 'أصفّق للنجاح', fr: 'Bravo !', en: 'Well done!' }, hint: { ar: 'عند حفظ وصفة أو إنهاء كشف', fr: 'Ordonnance enregistrée', en: 'On prescription/visit save' } },
  { id: 'nod', label: { ar: 'إيماءة موافقة', fr: 'Hocher (Oui)', en: 'Nod' }, phrase: { ar: 'موافق', fr: 'Compris', en: 'Confirmed' }, hint: { ar: 'تأكيد أمر', fr: 'Confirmation', en: 'Confirm action' } },
  { id: 'no', label: { ar: 'هزّ الرأس (لا)', fr: 'Refuser (Non)', en: 'Shake Head' }, phrase: { ar: 'غير مسموح', fr: 'Action non autorisée', en: 'Not allowed' }, hint: { ar: 'رفض إجراء غير صالح', fr: 'Données invalides', en: 'Invalid or blocked action' } },
  { id: 'bow', label: { ar: 'انحناءة ترحيب', fr: 'Révérence', en: 'Bow' }, phrase: { ar: 'أرحّب بك', fr: 'Bienvenue Docteur', en: 'Welcome Doctor' }, hint: { ar: 'أول تسجيل دخول في اليوم', fr: 'Première connexion', en: 'First daily login' } },
  { id: 'open', label: { ar: 'فتح الذراعين', fr: 'Bras ouverts', en: 'Open Arms' }, phrase: { ar: 'أهلاً وسهلاً', fr: 'Bienvenue', en: 'Welcome!' }, hint: { ar: 'شاشة الترحيب والجولة التعريفية', fr: 'Présentation', en: 'Welcome tour' } },
  { id: 'raise', label: { ar: 'رفع اليد', fr: 'Lever la main', en: 'Raise Hand' }, phrase: { ar: 'لديّ ملاحظة', fr: 'Une remarque', en: 'Attention needed' }, hint: { ar: 'تنبيه لملاحظة أو مريض ينتظر طويلاً', fr: 'Patient en attente', en: 'Waiting alert' } },
  { id: 'beckon', label: { ar: 'استدعاء', fr: 'Appeler', en: 'Beckon' }, phrase: { ar: 'تفضّل', fr: 'Par ici', en: 'Step in' }, hint: { ar: 'دعوة لقسم أو إجراء', fr: 'Orienter vers un onglet', en: 'Guide to section' } },
  { id: 'shrug', label: { ar: 'هزّ الكتفين', fr: 'Hausser épaules', en: 'Shrug' }, phrase: { ar: 'لا أدري', fr: 'Aucune donnée', en: 'Not sure' }, hint: { ar: 'عدم توفر بيانات', fr: 'Question non comprise', en: 'No data found' } },
  { id: 'cele', label: { ar: 'احتفال هادئ', fr: 'Célébration', en: 'Celebrate' }, phrase: { ar: 'تمّت المهمة', fr: 'Mission accomplie', en: 'All done!' }, hint: { ar: 'إكمال سلسلة مهام', fr: 'Objectif atteint', en: 'Task milestone' } },
  { id: 'look', label: { ar: 'نظرة حول المكان', fr: 'Observer', en: 'Look Around' }, phrase: { ar: 'أتفقّد المكان', fr: 'Vérification', en: 'Checking around' }, hint: { ar: 'الانتظار والتفقد', fr: 'En veille active', en: 'Idle check' } },
];

export const ROBOT_THEMES_LIST: Array<{ id: RobotTheme; label: { ar: string; fr: string; en: string }; swatchGradient: string }> = [
  { id: 'white', label: { ar: 'أبيض (الافتراضي)', fr: 'Blanc (Défaut)', en: 'White (Default)' }, swatchGradient: 'linear-gradient(135deg, #ffffff, #aab4c2)' },
  { id: 'black', label: { ar: 'أسود معدني', fr: 'Noir Titane', en: 'Obsidian Black' }, swatchGradient: 'linear-gradient(135deg, #6d7585, #07090c)' },
  { id: 'gold', label: { ar: 'ذهبي', fr: 'Or Satiné', en: 'Satin Gold' }, swatchGradient: 'linear-gradient(135deg, #fff6d2, #b88a24)' },
  { id: 'teal', label: { ar: 'أخضر مزرق', fr: 'Turquoise Médical', en: 'Medical Teal' }, swatchGradient: 'linear-gradient(135deg, #aef0e3, #06585a)' },
  { id: 'navy', label: { ar: 'أزرق ليلي', fr: 'Bleu Nuit', en: 'Midnight Navy' }, swatchGradient: 'linear-gradient(135deg, #b9c9ee, #34457f)' },
];

export const ROBOT_OUTFITS_LIST: Array<{ id: RobotOutfitItem; label: { ar: string; fr: string; en: string } }> = [
  { id: 'coat', label: { ar: 'معطف طبيب', fr: 'Blouse médecin', en: 'Doctor Coat' } },
  { id: 'steth', label: { ar: 'سماعة طبية', fr: 'Stéthoscope', en: 'Stethoscope' } },
  { id: 'glasses', label: { ar: 'نظارة', fr: 'Lunettes', en: 'Glasses' } },
  { id: 'jacket', label: { ar: 'جاكيت', fr: 'Veste', en: 'Jacket' } },
  { id: 'tie', label: { ar: 'ربطة عنق', fr: 'Nœud papillon', en: 'Bow Tie' } },
  { id: 'headset', label: { ar: 'سماعة رأس', fr: 'Casque audio', en: 'Headset' } },
  { id: 'hat', label: { ar: 'قبعة', fr: 'Casquette', en: 'Cap' } },
  { id: 'shoes', label: { ar: 'حذاء', fr: 'Chaussures', en: 'Shoes' } },
];

export const ROBOT_OUTFIT_PRESETS: Array<{ id: 'doc' | 'formal' | 'support' | 'none'; label: { ar: string; fr: string; en: string }; items: RobotOutfitItem[] }> = [
  { id: 'doc', label: { ar: 'طقم الطبيب', fr: 'Tenue Médecin', en: 'Doctor Kit' }, items: ['coat', 'steth', 'glasses'] },
  { id: 'formal', label: { ar: 'طقم رسمي', fr: 'Tenue Formelle', en: 'Formal Suit' }, items: ['jacket', 'tie', 'glasses', 'shoes'] },
  { id: 'support', label: { ar: 'طقم الدعم', fr: 'Tenue Support', en: 'Support Desk' }, items: ['headset', 'glasses', 'jacket'] },
  { id: 'none', label: { ar: 'إزالة الكل', fr: 'Tout retirer', en: 'Remove All' }, items: [] },
];

export function toggleRobotOutfitItem(current: RobotOutfitItem[], item: RobotOutfitItem): RobotOutfitItem[] {
  const exists = current.includes(item);
  if (exists) return current.filter((x) => x !== item);
  const next = [...current, item];
  if (item === 'jacket') return next.filter((x) => x !== 'coat');
  if (item === 'coat') return next.filter((x) => x !== 'jacket');
  return next;
}

export async function runRobotActionSequence(
  action: RobotAction,
  driver: RobotActionDriver,
  wait: (ms: number) => Promise<void>
): Promise<void> {
  switch (action) {
    case 'smile': {
      driver.setExpression('happy');
      driver.setEffect?.('sparkles');
      driver.setHead(-6, 0, -2);
      driver.setArm('R', -90);
      await wait(450);
      driver.setHead(5, 0, -3);
      driver.setArm('R', -105);
      await wait(650);
      driver.setHead(0, 0, -2);
      await wait(650);
      break;
    }
    case 'laugh': {
      driver.setExpression('laugh');
      driver.setEffect?.('sparkles');
      for (let i = 0; i < 4; i++) {
        driver.setBodyTransform('translateY(-10px) rotate(-2deg)');
        driver.setHead(-7, 0, -4);
        driver.setArm('L', 64, 12, -6);
        driver.setArm('R', -64, -12, -6);
        await wait(190);
        driver.setBodyTransform('translateY(2px) rotate(2deg)');
        driver.setHead(7, 0, 2);
        driver.setArm('L', 34, 4, 0);
        driver.setArm('R', -34, -4, 0);
        await wait(190);
      }
      driver.setBodyTransform('translateY(-4px)');
      await wait(260);
      break;
    }
    case 'sad': {
      driver.setExpression('sad');
      driver.setEffect?.('tear');
      driver.setBodyTransform('translateY(8px) scaleY(.97)');
      driver.setHead(-6, 0, 12);
      driver.setGaze(0, 5);
      driver.setArm('L', -16, 6, 8);
      driver.setArm('R', 16, -6, 8);
      await wait(950);
      driver.setHead(5, 0, 14);
      await wait(900);
      driver.setHead(0, 0, 10);
      await wait(600);
      break;
    }
    case 'fly': {
      driver.setExpression('fly');
      driver.setEffect?.('thruster');
      driver.setArm('L', 88, -6, -8);
      driver.setArm('R', -88, 6, -8);
      driver.setBodyTransform('translateY(-14px) scale(1.02)');
      await wait(280);
      driver.setBodyTransform('translate(-18px, -42px) rotate(-7deg) scale(1.04)');
      driver.setHead(6, 2, -4);
      await wait(480);
      driver.setBodyTransform('translate(18px, -50px) rotate(7deg) scale(1.05)');
      driver.setHead(-6, -2, -5);
      await wait(520);
      driver.setBodyTransform('translate(0px, -38px) rotate(0deg) scale(1.03)');
      driver.setArm('L', 110, -4, -10);
      driver.setArm('R', -110, 4, -10);
      await wait(450);
      driver.setBodyTransform('translateY(-12px)');
      await wait(260);
      break;
    }
    case 'dance': {
      driver.setExpression('laugh');
      driver.setEffect?.('sparkles');
      for (let i = 0; i < 3; i++) {
        driver.setBodyTransform('translate(-10px, -8px) rotate(-4deg)');
        driver.setArm('L', 142);
        driver.setArm('R', -46);
        driver.setHead(-8);
        await wait(270);
        driver.setBodyTransform('translate(10px, -8px) rotate(4deg)');
        driver.setArm('L', 46);
        driver.setArm('R', -142);
        driver.setHead(8);
        await wait(270);
      }
      break;
    }
    case 'love': {
      driver.setExpression('happy');
      driver.setEffect?.('love');
      driver.setHead(-8, 0, -2);
      driver.setArm('L', 58, 22, -6);
      driver.setArm('R', -58, -22, -6);
      driver.setBodyTransform('translateY(-5px)');
      await wait(1100);
      driver.setArm('L', 84, -4);
      driver.setArm('R', -84, 4);
      driver.setHead(5, 0, -2);
      await wait(750);
      break;
    }
    case 'wink': {
      driver.setExpression('wink');
      driver.setEffect?.('sparkles');
      driver.setHead(7, 2, -2);
      driver.setArm('R', -132);
      await wait(950);
      driver.setArm('R', -150);
      await wait(450);
      break;
    }
    case 'scan': {
      driver.setExpression('working');
      driver.setEffect?.('scan');
      driver.setHead(-4, -2, 0);
      driver.setGaze(-4, 0);
      driver.setArm('R', -88, 0, 0, true);
      await wait(650);
      driver.setHead(4, 2, 0);
      driver.setGaze(4, 0);
      await wait(700);
      driver.setHead(0, 0, -2);
      driver.setGaze(0, 0);
      await wait(600);
      break;
    }
    case 'wave': {
      driver.setExpression('happy');
      driver.setArm('R', -140);
      await wait(450);
      for (let i = 0; i < 4; i++) {
        driver.setArm('R', -166);
        await wait(260);
        driver.setArm('R', -128);
        await wait(260);
      }
      break;
    }
    case 'clap': {
      driver.setExpression('success');
      driver.setEffect?.('sparkles');
      for (let i = 0; i < 5; i++) {
        driver.setArm('L', 42, 20);
        driver.setArm('R', -42, -20);
        await wait(170);
        driver.setArm('L', 62, 34);
        driver.setArm('R', -62, -34);
        await wait(140);
      }
      break;
    }
    case 'nod': {
      for (let i = 0; i < 3; i++) {
        driver.setHead(0, 0, 8);
        await wait(230);
        driver.setHead(0, 0, -1);
        await wait(230);
      }
      break;
    }
    case 'no': {
      for (let i = 0; i < 3; i++) {
        driver.setHead(8);
        driver.setGaze(-3, 0);
        await wait(260);
        driver.setHead(-8);
        driver.setGaze(3, 0);
        await wait(260);
      }
      break;
    }
    case 'bow': {
      driver.setExpression('happy');
      driver.setBodyTransform('translateY(6px) scaleY(.965)');
      driver.setHead(0, 0, 12);
      await wait(1000);
      break;
    }
    case 'open': {
      driver.setExpression('attention');
      driver.setArm('L', 78, -6);
      driver.setArm('R', -78, 6);
      await wait(1500);
      break;
    }
    case 'raise': {
      driver.setArm('R', -178);
      driver.setHead(3);
      await wait(1600);
      break;
    }
    case 'beckon': {
      driver.setArm('R', -100);
      await wait(350);
      for (let i = 0; i < 4; i++) {
        driver.setArm('R', -128);
        await wait(280);
        driver.setArm('R', -92);
        await wait(280);
      }
      break;
    }
    case 'shrug': {
      driver.setExpression('flat');
      driver.setArm('L', 34, 0, -8);
      driver.setArm('R', -34, 0, -8);
      driver.setHead(5, 0, 2);
      await wait(1200);
      break;
    }
    case 'cele': {
      driver.setExpression('laugh');
      driver.setEffect?.('sparkles');
      driver.setArm('L', 160);
      driver.setArm('R', -160);
      await wait(500);
      for (let i = 0; i < 3; i++) {
        driver.setArm('L', 148);
        driver.setArm('R', -148);
        await wait(300);
        driver.setArm('L', 168);
        driver.setArm('R', -168);
        await wait(300);
      }
      break;
    }
    case 'look': {
      driver.setHead(-6);
      driver.setGaze(-5, 0);
      await wait(700);
      driver.setHead(6);
      driver.setGaze(5, 0);
      await wait(700);
      driver.setHead(0, 0, -3);
      driver.setGaze(0, -4);
      await wait(600);
      break;
    }
  }
}
