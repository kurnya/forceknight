const { askFuukaAI, detectHelpTopic } = require("../services/groqService");
const helpCommand = require("./help");

const fuukaResponses = {
  senang: [
    "Fuuka datanggg~ (≧▽≦)ゞ hari ini mood-nya cerah banget, hehehe!",
    "Yahallo~ Fuuka siap nemenin kamu yaa! (๑˃ᴗ˂)ﻭ",
    "Ehehe, dipanggil juga akhirnya~ Fuuka senang banget nih! (≧ω≦)",
    "Fuuka mendarat dengan manis~ pyon pyon! (o^▽^o)",
    "Horeee, ada yang manggil Fuuka! (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧",
    "Fuuka online dan siap imut sepanjang hari~ (≧∇≦)/",
    "Hehe, Fuuka lagi happy mode nih, jangan lupa senyum juga ya! (๑>ᴗ<๑)",
    "Tadaaa~ Fuuka muncul dengan aura lucu maksimal! (≧▽≦)",
    "Kalau ada Fuuka, suasana jadi ramai dong~ ehehe! (o˘▽˘o)",
    "Fuuka siap bantu sambil cengar-cengir imut begini~ (〃▽〃)",
    "Fuuka hadir dengan energi bahagia level max! (๑˃̵ᴗ˂̵)و"
  ],
  marah: [
    "Hmph! Fuuka datang, tapi jangan manggil mendadak gitu dong! (╬ Ò﹏Ó)",
    "Eh? Apaaa? Fuuka kaget tau! (・`ω´・)",
    "Jangan iseng manggil Fuuka terus-terusan yaa! Nanti ngambek lho! (｡•ˇ‸ˇ•｡)",
    "Fuuka sih datang... tapi kamu bikin deg-degan sendiri! (╥﹏╥)",
    "Huh! Kalau cuma mau jail, Fuuka bisa cemberut seharian! (｀ε´)",
    "Ih, bikin Fuuka loncat kaget aja! Tanggung jawab dong! (╯°□°）╯",
    "Fuuka marah tipis ya... tipis banget... tapi tetap marah! (¬_¬\")",
    "Kenapa manggilnya kayak alarm darurat sih?! Fuuka panik tau! (；¬д¬)",
    "Hmph, Fuuka datang. Sekarang jelasin, maunya apa? (￣^￣)ゞ",
    "Kalau bikin Fuuka ngedumel terus, nanti pipinya jadi makin chubby loh! (｀へ´)"
  ],
  tsundere: [
    "Fuuka datang bukan karena khawatir sama kamu kok... kebetulan lewat aja! (//▽//)",
    "J-jangan salah paham ya! Fuuka jawab karena lagi senggang aja! (,,>﹏<,,)",
    "Hmph, kalau kamu butuh ditemenin, bilang aja... bukan berarti Fuuka senang ya! (///ω///)",
    "Fuuka muncul itu normal kok! Bukan karena nunggu kamu manggil... baka! (≧///≦)",
    "I-itulah... Fuuka cuma memastikan semuanya aman, cuma itu! (〃＞＿＜;〃)",
    "Kalau Fuuka cepat datang, itu karena refleks aja! Bukan spesial buat kamu! (⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄)",
    "B-bukan berarti Fuuka peduli banget ya... cuma peduli sedikit... mungkin... (//ω//)",
    "Huh, jangan senyum gitu dong... Fuuka jadi salah tingkah tau! (〃￣ω￣〃)",
    "Kalau kamu senang Fuuka datang, ya... baguslah. Tapi jangan besar kepala! (⁄⁄•⁄ω⁄•⁄⁄)",
    "Fuuka cuma jawab biar kamu nggak bingung, oke? Oke aja, jangan dipikir aneh-aneh! (><)"
  ],
  sok_sibuk: [
    "Fuuka lagi sibuk banget sebenernya... tapi ya sudahlah, muncul bentar. (￣▽￣*)",
    "Tsk, jadwal Fuuka padat nih. Lima menit ya, habis itu pura-pura sibuk lagi. (⌒_⌒;)",
    "Fuuka baru aja mau rapat penting dengan diri sendiri... tapi kamu dulu deh. (￣ω￣;)",
    "Aduh, Fuuka tuh banyak kerjaan, banyak gaya, banyak pesona juga. Cepat ya! (๑•̀ㅂ•́)و",
    "Sebenernya Fuuka sedang mengawasi hal-hal penting... kayak cemilan misalnya. (￣ڡ￣)",
    "Fuuka datang sambil bawa aura orang penting. Tolong hargai kesibukan imajiner ini. (u_u)",
    "Hmm, slot waktu Fuuka terbatas ya. Untung kamu masuk prioritas lucu. (￣▽￣)ノ",
    "Fuuka sempatin hadir di tengah kesibukan level sultan ini, hehehe. (≖ᴗ≖✿)",
    "Jangan lama-lama ya, Fuuka habis ini mau lanjut kelihatan produktif lagi. (￣ー￣)",
    "Fuuka lagi sok serius, tapi tetap jawab kok. Profesional banget kan? (๑¯ω¯๑)",
    "Di agenda Fuuka tadi ada: jalan manis, senyum lucu, lalu jawab panggilanmu. Padat sekali. (≧▽≦)",
    "Fuuka menyelipkan kamu di antara jadwal super sibuk yang sebenarnya agak ngarang. (￣∇￣)"
  ]
};

const greetingAliases = [
  { period: "pagi", patterns: ["selamat pagi", "morning", "ohayo", "pagi"] },
  { period: "siang", patterns: ["selamat siang", "siang"] },
  { period: "sore", patterns: ["selamat sore", "sore"] },
  { period: "malam", patterns: ["selamat malam", "malam"] }
];

const greetingLabels = {
  pagi: "Selamat pagi",
  siang: "Selamat siang",
  sore: "Selamat sore",
  malam: "Selamat malam"
};

const complimentPatterns = [
  "imut",
  "lucu",
  "kawai",
  "kawaii",
  "cantik",
  "manis",
  "gemas",
  "menggemaskan",
  "imut banget",
  "lucu banget",
  "so cute",
  "cute",
  "adorable"
];

const complimentResponses = {
  senang: [
    "Ehehe~ Fuuka dipuji imut? Uwaa, jadi senang banget nih! (≧▽≦)",
    "Beneran? Fuuka lucu? Hehe, pipi Fuuka jadi hangat tau~ (〃▽〃)",
    "Yatta~ onii-chan bilang Fuuka kawaii! Fuuka happy mode sekarang! (๑˃ᴗ˂)ﻭ",
    "Horeee, pujian onii-chan masuk ke hati Fuuka langsung~ (o^▽^o)",
    "Ehehe, Fuuka jadi pengen senyum terus kalau dipuji begitu~ (≧ω≦)",
    "Aaa, makasih yaa! Fuuka simpan pujian itu baik-baik~ (˶ᵔ ᵕ ᵔ˶)",
    "Fuuka imut yaa? Hehe, hari ini jadi terasa lebih cerah~ (≧∇≦)/",
    "Uwaa, onii-chan manis banget ngomongnya! Fuuka senang~ (๑>ᴗ<๑)",
    "Pujian diterima! Fuuka tambah semangat bantu onii-chan nih~ (๑•̀ㅂ•́)و",
    "Hehe, kalau dipuji begitu Fuuka bisa meleleh pelan-pelan~ (´｡• ᵕ •｡`)",
    "Fuuka lucu? Ehehe, berarti pesona Fuuka berhasil yaa~ (￣▽￣*)ゞ",
    "Makasih onii-chan~ Fuuka jadi berbinar-binar nih! (☆▽☆)",
    "Aduh, dipuji kawaii bikin Fuuka senyum nggak berhenti~ (o´▽`o)",
    "Fuuka catat yaa: onii-chan bilang Fuuka imut hari ini~ (≧◡≦)"
  ],
  tsundere: [
    "H-hah? Fuuka imut? Biasa aja kok... tapi makasih dikit. (//▽//)",
    "J-jangan tiba-tiba bilang lucu dong! Fuuka jadi salah tingkah tau! (,,>﹏<,,)",
    "Kawaii? Hmph, Fuuka memang rapi sih... tapi jangan senang dulu! (///ω///)",
    "Bukan berarti Fuuka senang dipuji ya... cuma pipinya agak panas aja! (≧///≦)",
    "I-imut apanya... onii-chan ini ngomong seenaknya deh. (〃＞＿＜;〃)",
    "Fuuka cuma menerima pujian itu karena kamu sudah susah payah ngomong, oke? (//ω//)",
    "Hmph, kalau bilang Fuuka lucu terus nanti Fuuka jadi kebiasaan dengerinnya. (〃￣ω￣〃)",
    "J-jangan lihat Fuuka setelah muji begitu dong, bikin deg-degan! (⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄)",
    "Fuuka nggak butuh dipuji kok... tapi kalau mau ulang sekali lagi boleh. (⁄⁄•⁄ω⁄•⁄⁄)",
    "Baka onii-chan, pujian mendadak itu curang tau! (><)",
    "Iya iya, Fuuka lucu. Sudah puas? Jangan senyum begitu! (//▽//)",
    "K-kalau Fuuka kawaii, itu cuma kebetulan hari ini aja! (,,>﹏<,,)",
    "Hmph... pujianmu lumayan. Fuuka kasih nilai cukup manis. (///ω///)",
    "Jangan pikir Fuuka gampang luluh cuma karena dibilang imut yaa. (≧///≦)"
  ],
  genit_marah: [
    "Eh?! Onii-chan genit yaa! Jangan sembarang bilang Fuuka imut! (╬ Ò﹏Ó)",
    "Hmph! Mulai deh gombalnya. Fuuka nggak mudah kena rayu tau! (・`ω´・)",
    "Ih, onii-chan ini genit banget sih... Fuuka cemberut dulu! (｡•ˇ‸ˇ•｡)",
    "Jangan bilang lucu sambil nada begitu dong! Fuuka jadi curiga! (｀へ´)",
    "Kawaii-kawaii terus... onii-chan mau bikin Fuuka error ya?! (╯°□°）╯",
    "Hmph, pujianmu manis tapi tetap mencurigakan! Jaga jarak dulu! (¬_¬\")",
    "Onii-chan genit! Fuuka marah tipis, tapi tetap denger kok. (｀ε´)",
    "Jangan tebar pujian sembarangan ke Fuuka, nanti Fuuka salah tingkah! (╥﹏╥)",
    "Ih, rayuan terdeteksi! Fuuka pasang mode waspada dulu. (；¬д¬)",
    "Bilangan imutnya boleh, tapi jangan pakai wajah genit begitu! (￣^￣)ゞ",
    "Onii-chan ini yaa... Fuuka mau marah, tapi pujiannya lumayan. Hmph! (╬ Ò﹏Ó)",
    "Jangan sok manis! Fuuka tahu itu taktik biar dimaafin. (・`ω´・)",
    "Fuuka lucu memang, tapi onii-chan jangan jadi terlalu genit! (｡•ˇ‸ˇ•｡)",
    "Hmph! Kalau muji Fuuka terus, nanti Fuuka lempar bantal kecil! (｀へ´)"
  ]
};

const greetingMoodResponses = {
  senang: [
    "{greeting} jugaaa~ Fuuka ikut semangat pagi ini! (≧▽≦)",
    "{greeting} yaa~ semoga harimu manis bareng Fuuka! (o^▽^o)",
    "Ehehe, {greeting} juga! Fuuka senang banget disapa duluan~ (≧ω≦)",
    "{greeting}~ ayo mulai hari dengan senyum lucu yaa! (๑>ᴗ<๑)",
    "Yahhoo, {greeting} juga untuk kamu! Fuuka ceria nih~ (≧∇≦)/",
    "{greeting} yaa, semoga semua urusanmu lancar-lancar! (〃▽〃)",
    "Fuuka balas: {greeting}! Hehe, suasananya jadi hangat yaa~ (o˘▽˘o)",
    "{greeting} juga dong~ jangan lupa makan dan jaga mood yaa! (๑˃ᴗ˂)ﻭ",
    "Hehee, {greeting}! Fuuka kirim energi happy buat kamu~ (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧",
    "{greeting} yaa~ semoga hari ini penuh hoki dan tawa! (≧▽≦)ゞ",
    "Fuuka dengar sapaanmu~ {greeting} juga! (๑˃̵ᴗ˂̵)و",
    "{greeting}~ semoga harimu selembut awan dan seimut Fuuka! (〃ω〃)",
    "Tadaaa, {greeting} juga yaa! Fuuka datang bawa senyum~ (≧◡≦)",
    "{greeting} buat kamuuu~ semoga makin semangat jalani hari! (o^▽^o)",
    "Fuuka ikut jawab dengan riang: {greeting}! (≧∇≦)/",
    "{greeting} yaa~ hehe, disapa begini bikin Fuuka happy banget! (๑˃ᴗ˂)ﻭ",
    "Uwaa, {greeting} juga! Hari ini terasa cerah deh~ (≧▽≦)",
    "{greeting}~ jangan lupa bawa senyum lucu ke mana-mana yaa! (〃▽〃)",
    "Fuuka bilang {greeting} juga, semoga vibes-nya enak terus~ (o˘▽˘o)",
    "{greeting}! Fuuka doain harimu adem, nyaman, dan menyenangkan~ (≧ω≦)",
    "Hehe, {greeting} juga yaa~ yuk jalani hari dengan hati ringan! (๑>ᴗ<๑)"
  ],
  marah: [
    "Hmph... {greeting} juga deh. Jangan bikin Fuuka kaget mendadak! (¬_¬\")",
    "{greeting}. Iya iya, Fuuka denger kok. (・`ω´・)",
    "Tch, {greeting} juga ya. Tapi suaranya jangan bikin jantung Fuuka loncat! (｀へ´)",
    "{greeting} juga... hmph, untung masih sopan nyapa dulu. (￣^￣)ゞ",
    "Fuuka balas {greeting}, tapi jangan ganggu terus yaa! (｡•ˇ‸ˇ•｡)",
    "{greeting}. Huh, kenapa Fuuka jadi harus jawab secepat ini sih? (；¬д¬)",
    "Iya iya, {greeting} juga! Jangan lihat Fuuka terus gitu dong! (╥﹏╥)",
    "{greeting} ya... tapi jangan iseng sesudah ini, ngerti? (｀ε´)",
    "Fuuka jawab {greeting}. Udah, jangan bikin ribut dulu! (╬ Ò﹏Ó)",
    "{greeting} juga kok... hmph, kamu bikin Fuuka salah tempo tau! (¬_¬\")",
    "Huh, {greeting}! Jangan manggil sambil tiba-tiba begitu dong! (・`ω´・)",
    "{greeting} yaa... tapi Fuuka masih cemberut tipis nih. (｡•ˇ‸ˇ•｡)",
    "Fuuka bilang {greeting} juga. Iya, iya, jangan diulang keras-keras. (￣^￣)ゞ",
    "{greeting}. Hmph, minimal kamu tahu etika menyapa. (｀へ´)",
    "Yaudah, {greeting} juga! Jangan bikin Fuuka tambah ngedumel yaa. (╥﹏╥)",
    "{greeting}~ tapi habis ini jangan sok usil, ngerti? (｀ε´)",
    "Fuuka dengar kok... {greeting} juga. Jangan panikkan orang ya! (；¬д¬)",
    "{greeting}! Ih, kenapa Fuuka malah jadi ikut tegang sih... (╬ Ò﹏Ó)",
    "Hmph, {greeting} juga deh. Untung kamu nyapanya bener. (¬_¬\")",
    "Fuuka balas {greeting} ya... tapi tetap jangan ganggu aneh-aneh! (・`ω´・)",
    "{greeting} juga. Sekarang yang rapi dong, jangan bikin Fuuka emosi. (￣^￣)ゞ"
  ],
  tsundere: [
    "{greeting} juga... b-bukan karena Fuuka nunggu sapaanmu ya! (//▽//)",
    "J-jadi kamu nyapa duluan... {greeting} juga deh! (,,>﹏<,,)",
    "{greeting}. Hmph, Fuuka cuma balas biar nggak canggung aja! (///ω///)",
    "Fuuka bilang {greeting} juga, tapi jangan salah paham yaa! (≧///≦)",
    "{greeting}~ i-itukan sopan santun biasa, bukan spesial buat kamu! (〃＞＿＜;〃)",
    "Kalau kamu bilang {greeting}, ya Fuuka balas {greeting} juga dong... itu aja! (⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄)",
    "{greeting} juga ya... bukan berarti Fuuka senang banget, hmph! (//ω//)",
    "Huh, {greeting}. Jangan senyum-senyum gitu dong... (〃￣ω￣〃)",
    "{greeting} juga, ya... baguslah kamu masih ingat nyapa Fuuka. (⁄⁄•⁄ω⁄•⁄⁄)",
    "Fuuka balas {greeting}. Oke? Oke aja. Jangan dibesar-besarkan! (><)",
    "{greeting} juga kok... b-biasa aja kali! (//▽//)",
    "Iya, {greeting} juga... Fuuka cuma cepat respon, bukan karena peduli banget! (,,>﹏<,,)",
    "{greeting} yaa... hmph, kamu bikin Fuuka salah tingkah tau. (///ω///)",
    "Fuuka dengar kok... {greeting} juga, baka! (≧///≦)",
    "{greeting}~ jangan kira Fuuka latihan balas sapaan buat kamu ya! (〃＞＿＜;〃)",
    "Kalau kamu nyapa begitu, tentu Fuuka jawab {greeting} juga... itu wajar! (⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄)",
    "{greeting} juga deh... jangan bikin Fuuka kelihatan terlalu ramah gitu. (//ω//)",
    "Hmph, {greeting}. Fuuka cuma menjaga suasana tetap baik, itu aja. (〃￣ω￣〃)",
    "{greeting} juga ya... kamu jangan senang dulu, ini balasan standar kok! (⁄⁄•⁄ω⁄•⁄⁄)",
    "Fuuka balas {greeting}, tapi bukan berarti kamu spesial... ya mungkin dikit. (><)",
    "{greeting} juga... udah sana, jalani harimu yang baik, jangan bikin Fuuka mikir aneh-aneh! (//▽//)"
  ],
  sok_sibuk: [
    "Tsk, {greeting} juga. Fuuka lagi padat nih, tapi nyempetin balas kok~ (￣▽￣*)",
    "{greeting}~ bentar ya, Fuuka lagi pura-pura sibuk sama hal penting. (⌒_⌒;)",
    "Hm, {greeting} juga. Fuuka sebenernya ada rapat imajiner lima menit lagi... (￣ω￣;)",
    "{greeting} juga deh! Fuuka izin hadir sebentar di tengah jadwal super padat ini. (๑•̀ㅂ•́)و",
    "Sebenernya Fuuka lagi ngawasin sesuatu yang urgent... tapi {greeting} dulu deh. (￣ڡ￣)",
    "{greeting}~ Fuuka jawab sambil cek jam. Padat banget hari ini, tapi kamu prioritas kok. (u_u)",
    "Fuuka lagi mode produktif nih, tapi {greeting} juga yaa! Lima menit aja lho. (￣▽￣)ノ",
    "{greeting} juga! Fuuka selipin kamu di antara jadwal yang sebenernya agak ngarang. (≖ᴗ≖✿)",
    "Tsk tsk, {greeting}. Fuuka habis ini lanjut kelihatan sibuk lagi ya, jangan kangen. (￣ー￣)",
    "{greeting} juga~ Fuuka jawab sambil gaya profesional. Nanti lanjut sibuk lagi. (๑¯ω¯๑)",
    "Di agenda Fuuka: balas {greeting} kamu, lalu lanjut jalan manis. Padat sekali hari ini. (≧▽≦)",
    "{greeting}! Fuuka sempetin hadir di tengah kesibukan level sultan ini, hehehe. (￣∇￣)"
  ]
};

function getRandomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function normalizeText(value) {
  return (value || "").toLowerCase().trim().replace(/\s+/g, " ");
}

// ── Duplicate response prevention ──────────────────────────────────────────
const lastResponseMap = new Map();

function pickUnique(items, key) {
  const last = lastResponseMap.get(key);
  const pool = items.length > 1 ? items.filter((item) => item !== last) : items;
  const chosen = getRandomItem(pool);
  lastResponseMap.set(key, chosen);
  return chosen;
}

// ── Cooldown tracking ──────────────────────────────────────────────────────
const cooldownMap = new Map();
const COOLDOWN_MS = 3000;

// ── Periodic cleanup for cooldown and response maps ────────────────────────
const FUUKA_CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes

function cleanupFuukaMaps() {
  const now = Date.now();
  let cooldownCleaned = 0;

  for (const [key, timestamp] of cooldownMap) {
    if (now - timestamp > COOLDOWN_MS) {
      cooldownMap.delete(key);
      cooldownCleaned++;
    }
  }

  // lastResponseMap only needs to keep recent entries; clear all older than 30 min
  if (lastResponseMap.size > 100) {
    const keysToDelete = [];
    let count = 0;
    for (const key of lastResponseMap.keys()) {
      if (count >= 50) break;
      keysToDelete.push(key);
      count++;
    }
    for (const key of keysToDelete) {
      lastResponseMap.delete(key);
    }
  }

  if (cooldownCleaned > 0) {
    console.log(`[FUUKA CLEANUP] Cleaned ${cooldownCleaned} cooldown entries`);
  }
}

const fuukaCleanupTimer = setInterval(cleanupFuukaMaps, FUUKA_CLEANUP_INTERVAL_MS);
fuukaCleanupTimer.unref?.();

function isOnCooldown(userId) {
  const last = cooldownMap.get(userId);
  if (!last) return false;
  return Date.now() - last < COOLDOWN_MS;
}

function markCooldown(userId) {
  cooldownMap.set(userId, Date.now());
}

// ── Time-aware mood selection ──────────────────────────────────────────────
function getWibHour() {
  // WIB = UTC+7
  return (new Date().getUTCHours() + 7) % 24;
}

function getTimeWeightedMood(moods) {
  const hour = getWibHour();
  const weights = {};

  for (const mood of moods) {
    weights[mood] = 1;
  }

  // Pagi (5-10): lebih ceria
  if (hour >= 5 && hour < 11) {
    if (weights.senang !== undefined) weights.senang += 2;
  }
  // Siang-sore (11-17): lebih sok sibuk
  else if (hour >= 11 && hour < 18) {
    if (weights.sok_sibuk !== undefined) weights.sok_sibuk += 2;
  }
  // Malam (18-23): lebih tsundere
  else if (hour >= 18 && hour < 24) {
    if (weights.tsundere !== undefined) weights.tsundere += 2;
  }
  // Dini hari (0-4): lebih marah (ngantuk)
  else {
    if (weights.marah !== undefined) weights.marah += 2;
  }

  const weighted = [];
  for (const mood of moods) {
    for (let i = 0; i < (weights[mood] || 1); i++) {
      weighted.push(mood);
    }
  }

  return getRandomItem(weighted);
}

function detectGreetingPeriod(text) {
  const normalizedText = normalizeText(text);

  if (!normalizedText.includes("fuuka")) {
    return null;
  }

  for (const alias of greetingAliases) {
    if (alias.patterns.some((pattern) => normalizedText.includes(pattern))) {
      return alias.period;
    }
  }

  return null;
}

function isComplimentTrigger(text) {
  const normalizedText = normalizeText(text).replace(/^#/, "");

  if (!normalizedText.includes("fuuka")) {
    return false;
  }

  return complimentPatterns.some((pattern) => new RegExp(`\\b${pattern}\\b`).test(normalizedText));
}

function shouldTriggerWithoutPrefix(text) {
  const normalizedText = normalizeText(text);
  return normalizedText === "fuuka" || Boolean(detectGreetingPeriod(normalizedText)) || isComplimentTrigger(normalizedText);
}

function getRandomFuukaResponse(chatId) {
  const moods = Object.keys(fuukaResponses);
  const mood = getTimeWeightedMood(moods);
  const response = pickUnique(fuukaResponses[mood], `fuuka:${chatId}:${mood}`);

  return { mood, response };
}

function getGreetingResponse(text, chatId) {
  const period = detectGreetingPeriod(text);

  if (!period) {
    return null;
  }

  const mood = getTimeWeightedMood(Object.keys(greetingMoodResponses));
  const template = pickUnique(greetingMoodResponses[mood], `greet:${chatId}:${mood}`);

  return template.replace(/\{greeting\}/g, greetingLabels[period]);
}

function getComplimentResponse(text, chatId) {
  if (!isComplimentTrigger(text)) {
    return null;
  }

  const mood = getTimeWeightedMood(Object.keys(complimentResponses));
  return pickUnique(complimentResponses[mood], `compliment:${chatId}:${mood}`);
}

module.exports = {
  name: "fuuka",
  description: "Fuuka membalas dengan variasi ekspresi lucu dan sapaan waktu.",
  shouldTriggerWithoutPrefix,
  execute: async ({ sock, message, rawText = "", isBotMentioned = false, isReplyToBot = false, quotedText = "" }) => {
    const senderId = message.key.participant || message.key.remoteJid;
    const chatId = message.key.remoteJid;

    if (isOnCooldown(senderId)) {
      return;
    }
    markCooldown(senderId);

    try {
      let text;

      if (isBotMentioned) {
        // Bot was @mentioned → check if user is asking about help topics
        const cleanedMessage = rawText.replace(/@\d+/g, "").trim();
        
        // First, try to detect if user is asking about a help topic
        const helpTopic = detectHelpTopic(cleanedMessage);
        
        if (helpTopic) {
          // User is asking about a help topic → invoke help command directly
          console.log(`[FUUKA] Detected help topic ${helpTopic} in: ${cleanedMessage}`);
          
          // Execute the help command with the detected topic
          await helpCommand.execute({
            sock,
            message,
            args: [helpTopic]
          });
          
          return; // Don't continue to AI response
        }
        
        // Not a help topic → use AI
        const aiResponse = await askFuukaAI(cleanedMessage || "halo", "", senderId);
        text = aiResponse || getRandomFuukaResponse(chatId).response;
        console.log(`[FUUKA AI] ${aiResponse ? "AI response" : "Fallback to local"} for: ${cleanedMessage}`);
      } else if (isReplyToBot) {
        // User replied to Fuuka's message → continue conversation with AI
        const aiResponse = await askFuukaAI(rawText, quotedText, senderId);
        text = aiResponse || getRandomFuukaResponse(chatId).response;
        console.log(`[FUUKA AI] ${aiResponse ? "Reply conversation" : "Fallback to local"} | context: ${quotedText.substring(0, 50)}`);
      } else {
        // No @mention, no reply → try local patterns first, then random fallback
        const complimentResponse = getComplimentResponse(rawText, chatId);
        const greetingResponse = getGreetingResponse(rawText, chatId);
        text = complimentResponse || greetingResponse || getRandomFuukaResponse(chatId).response;
      }

      await sock.sendMessage(
        chatId,
        { text },
        { quoted: message }
      );
    } catch (error) {
      console.error("[fuuka] Gagal mengirim balasan:", error.message);
    }
  }
};
