// Filenames are also the public chat shortcodes. Keep their original casing for display.
const files = `
19.png 20angry.png 20doggo.png 20feliz.png 20felizthumbsup.png 20nerd.png 20thumbsdown.png agony.png
apreton.png awooga.png baikinmanwave.png birdge.gif bop.png buenas.png buenas2.png businessire.png
catdelusion.png catdespair.png catge.png catrose.png caught.png CHATTING.gif chistoso.png
chommadge.png chommy.png chommydead.png chommyriot.png cluegi.png cluegichungus.png
cluegichungusdeluxe.png como.png comochungus.png comoserious.png concow.png cutege.png cwl.png
DentgeHandshake.png disbelief.png Dogge.png doggers.png dogmelon.png dogRose.png doncato.png
DONTENJOY.png eminemquestion.png ENJOY.png esfrega.png estetipo.png gregory.png hanThink.png
heheh.png HMM.png HUH.png hyo.gif ICANT.png joeangry.png joetrue.png joyball.png joyholyshit.png
ka.png kaoHug.png kaoPinch.png kaoScared.png kaoSleep.png kaoSmile.png kaoYawn.png kekw.png
kkkkk.png komHappy.png komWan.png kyoHuh.png kyoOk.png lesGO.png liemeter.png lilCry.png lilDead.png
lilSip.png lilWhoa.png marSurrender.png nimodo.png noeBullied.png nonoamigo.png NOTED.gif OAO.png
ojocon.png oldge.png PAUSERS.png pepega.png poeticcinema.png pogga.png pogsire.png pomoserious.png
prayge.png quagriot.gif QuagSip.png raiva.png raivas.png ritLove.png ronaldo.gif SadgePlant.png
sadgies.png SHADOG.png shiBlob.png shiHib.png shiPeek.png shiRock.png shiSing.png shiWave.png
skull_emoji.png skullybear.gif stare.png susge.png uohh.gif vosnatu.png WAAA.png waaah.png wah.png
wajaja.png wajajacat.png weirdge.png worryAMQ.png worryback.png worryblush.png worryconcon.png
worryfat.png worryfedora.png worryGGius.gif worryhype.png worryjong.png worrylmao.png
worrymindyou.png worrynani.png worryok.png worrypat.png worryriot.gif worrysus.png
worrytourhappy.png worryviste.png worryzzz.png xdd.png YAPPING.gif YAPPP.gif yepge.png yeshoney.png
yynpat.png yynStack.png
`.trim().split(/\s+/);

const images = new Map(files.map(file => [file.split('.')[0].toLowerCase(), file]));
const native = new Map(Object.entries({
  fire:'🔥', volcano:'🌋', question:'❓', clap:'👏', green_heart:'💚', musical_note:'🎵',
  eyes:'👀', tada:'🎉', sparkles:'✨', '100':'💯', heart_hands:'🫶', saluting_face:'🫡',
  joy:'😂', headphones:'🎧', cherry_blossom:'🌸'
}));
export const emojiChoices = [
  ...Array.from(native.keys(), name => ':' + name + ':'),
  ...files.map(file => ':' + file.split('.')[0] + ':')
];

function lookup(token) {
  const name = /^:([a-z0-9_]+):$/i.exec(token)?.[1]?.toLowerCase();
  return {file: images.get(name), glyph: native.get(name)};
}

export function isChatShortcode(token) {
  const {file, glyph} = lookup(token);
  return Boolean(file || glyph);
}

function emojiNode(token, lazy, personal) {
  const {file, glyph} = lookup(token);
  const custom=personal?.get(token.toLowerCase());
  if (!file && !custom) return glyph || token;
  const image = document.createElement('img');
  image.className = 'chat-emoji';
  image.alt = image.title = ':' + (custom?.name || file.split('.')[0]) + ':';
  if (lazy) image.loading = 'lazy';
  image.src = new URL(custom ? './api/chat-emoji-image?id='+encodeURIComponent(custom.id) : './chat-emojis/' + file, import.meta.url).href;
  return image;
}

export function renderChatText(element, text, lazy = false, personal) {
  const fragments = [];
  let start = 0;
  for (const match of text.matchAll(/:[a-z0-9_]+:/gi)) {
    if (!isChatShortcode(match[0]) && !personal?.has(match[0].toLowerCase())) continue;
    fragments.push(text.slice(start, match.index), emojiNode(match[0], lazy, personal));
    start = match.index + match[0].length;
  }
  element.replaceChildren(...fragments, text.slice(start));
}
