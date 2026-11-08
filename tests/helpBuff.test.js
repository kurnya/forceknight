const test = require("node:test");
const assert = require("node:assert/strict");
const help = require("../src/commands/help");

const BUFF = [
  { urutan: 1, nama: "Max HP", kode: "111" },
  { urutan: 2, nama: "DTE Api", kode: "222" },
  { urutan: 3, nama: "DTE Api", kode: "333" }
];
const LAND = [{ urutan: 1, label: "MP", nama: "punkz" }];

const sheet = (tabs) => async (tab) => (tab in tabs ? tabs[tab] : null);

test("buildBuffTopicText: data Sheet tersedia → teks dari data", async () => {
  const text = await help.buildBuffTopicText({ getTab: sheet({ buff: BUFF, buffland: LAND }) });
  assert.match(text, /Max HP\n111\n/);
  assert.match(text, /DTE Api\n222\n333\n/);
  assert.match(text, /MP {9}: punkz/);
  assert.ok(text.startsWith("━"));
});

test("buildBuffTopicText: buff null → string statis topicReplies['#3']", async () => {
  const text = await help.buildBuffTopicText({ getTab: sheet({}) });
  assert.equal(text, help.topicReplies["#3"]);
});

test("buildBuffTopicText: buff kosong (array []) → string statis, bukan pesan kosong", async () => {
  const text = await help.buildBuffTopicText({ getTab: sheet({ buff: [], buffland: LAND }) });
  assert.equal(text, help.topicReplies["#3"]);
});

test("buildBuffTopicText: buffland null tapi buff ada → tetap dari data, tanpa blok buffland", async () => {
  const text = await help.buildBuffTopicText({ getTab: sheet({ buff: BUFF }) });
  assert.match(text, /Max HP\n111/);
  assert.doesNotMatch(text, /Code buffland/);
});

test("buildBuffTopicText: getTab melempar → string statis", async () => {
  const text = await help.buildBuffTopicText({
    getTab: async () => {
      throw new Error("meledak");
    }
  });
  assert.equal(text, help.topicReplies["#3"]);
});

test("topicReplies['#3'] tetap string berisi judul (dicek messageHandler)", () => {
  assert.equal(typeof help.topicReplies["#3"], "string");
  assert.match(help.topicReplies["#3"], /Kode Buff Player Toram/);
});

test("execute #3: isi dari data Sheet, sapaan dan judul tetap, 'Baca selengkapnya' disisipkan", async () => {
  const sent = [];
  const sock = { sendMessage: async (jid, content) => sent.push(content.text) };
  await help.execute({
    sock,
    message: { key: { remoteJid: "grup@g.us" } },
    args: ["#3"],
    deps: { getTab: sheet({ buff: BUFF, buffland: LAND }) }
  });
  assert.equal(sent.length, 1);
  assert.match(sent[0], /Kode Buff Player Toram/);
  assert.match(sent[0], /Max HP\n111/);
  assert.ok(sent[0].includes(String.fromCharCode(8206)), "penyisip 'Baca selengkapnya' tetap ada");
});
