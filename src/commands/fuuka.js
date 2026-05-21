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
  "kawaii"
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
  ]
};

function getRandomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function normalizeText(value) {
  return (value || "").toLowerCase().trim().replace(/\s+/g, " ");
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

function getRandomFuukaResponse() {
  const moods = Object.keys(fuukaResponses);
  const mood = getRandomItem(moods);
  const response = getRandomItem(fuukaResponses[mood]);

  return { mood, response };
}

function getGreetingResponse(text) {
  const period = detectGreetingPeriod(text);

  if (!period) {
    return null;
  }

  const mood = getRandomItem(Object.keys(greetingMoodResponses));
  const template = getRandomItem(greetingMoodResponses[mood]);

  return template.replace(/\{greeting\}/g, greetingLabels[period]);
}

function getComplimentResponse(text) {
  if (!isComplimentTrigger(text)) {
    return null;
  }

  const mood = getRandomItem(Object.keys(complimentResponses));
  return getRandomItem(complimentResponses[mood]);
}

module.exports = {
  name: "fuuka",
  description: "Fuuka membalas dengan variasi ekspresi lucu dan sapaan waktu.",
  shouldTriggerWithoutPrefix,
  execute: async ({ sock, message, rawText = "" }) => {
    const complimentResponse = getComplimentResponse(rawText);
    const greetingResponse = getGreetingResponse(rawText);
    const text = complimentResponse || greetingResponse || getRandomFuukaResponse().response;

    await sock.sendMessage(
      message.key.remoteJid,
      {
        text
      },
      {
        quoted: message
      }
    );
  }
};
